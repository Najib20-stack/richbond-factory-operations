import { readFile } from "node:fs/promises";
import { DATABASE_AUTO_SEED, SEED_FILE } from "../config/env.js";
import { hashPassword, isPasswordHash, LEGACY_INITIAL_PASSWORD } from "../security/passwords.js";
import { auditDatabase } from "./databaseMaintenance.js";
import { runMigrations } from "./migrations.js";
import { closePostgresPool, postgresPool } from "./postgresPool.js";

const COLLECTIONS = ["departments", "users", "tasks", "activities", "reports", "notifications", "sessions", "auditLog"];
let initializationPromise;

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function databaseDate(value) {
  const candidate = dateOnly(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function canonicalRole(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized.includes("super") || normalized.includes("vérif")) return "Superviseur";
  if (normalized.includes("employ") || normalized.includes("responsable")) return "Employé";
  return role;
}

function repairedFrench(value) {
  return String(value || "").replace(/\bD\?partement\b/g, "Département");
}

async function normalizeData(input) {
  const data = structuredClone(input || {});
  for (const name of COLLECTIONS) data[name] = Array.isArray(data[name]) ? data[name] : [];
  data.weeklyProduction = Array.isArray(data.weeklyProduction) ? data.weeklyProduction : [];
  data.kpis = data.kpis && typeof data.kpis === "object" && !Array.isArray(data.kpis) ? data.kpis : {};

  for (const department of data.departments) {
    department.description = repairedFrench(department.description);
  }

  await Promise.all(data.users.map(async (user) => {
    user.role = canonicalRole(user.role);
    if (!isPasswordHash(user.passwordHash)) {
      user.passwordHash = await hashPassword(LEGACY_INITIAL_PASSWORD);
      user.mustChangePassword = true;
      user.passwordUpdatedAt = null;
    }
    user.mustChangePassword = Boolean(user.mustChangePassword);
    user.isActive = user.isActive !== false;
  }));

  const now = Date.now();
  data.sessions = data.sessions.filter((session) => Date.parse(session.expiresAt) > now);
  for (const task of data.tasks) {
    task.responsibleIds = Array.isArray(task.responsibleIds) && task.responsibleIds.length
      ? [...new Set(task.responsibleIds)]
      : [task.assignedEmployeeId].filter(Boolean);
    task.assignedEmployeeId = task.assignedEmployeeId || task.responsibleIds[0] || null;
    task.notes = Array.isArray(task.notes) ? task.notes : [];
    task.attachments = Array.isArray(task.attachments) ? task.attachments : [];
  }

  return data;
}

async function deleteMissing(client, table, ids) {
  if (ids.length) {
    await client.query(`DELETE FROM ${table} WHERE NOT (id = ANY($1::text[]))`, [ids]);
  } else {
    await client.query(`DELETE FROM ${table}`);
  }
}

async function persistData(client, rawData) {
  const data = await normalizeData(rawData);
  const audit = auditDatabase(data);
  if (!audit.ok) throw new Error(`Données PostgreSQL refusées : ${audit.errors.join(" ")}`);
  const userIds = new Set(data.users.map((user) => user.id));

  await client.query(
    `INSERT INTO app_settings (key, value) VALUES ('kpis', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(data.kpis)],
  );
  await client.query("DELETE FROM weekly_production");
  for (const [position, item] of data.weeklyProduction.entries()) {
    await client.query(
      "INSERT INTO weekly_production (position, day, value) VALUES ($1, $2, $3)",
      [position, item.day, Number(item.value || 0)],
    );
  }

  for (const [sortOrder, department] of data.departments.entries()) {
    await client.query(
      `INSERT INTO departments (id, name, description, capacity, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         capacity = EXCLUDED.capacity, sort_order = EXCLUDED.sort_order`,
      [department.id, department.name, department.description || "", Number(department.capacity || 0), sortOrder],
    );
  }

  for (const [sortOrder, user] of data.users.entries()) {
    await client.query(
      `INSERT INTO users (
         id, first_name, last_name, email, password_hash, role, department_id,
         phone, avatar, is_active, load, created_at, must_change_password,
         password_updated_at, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
         email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role, department_id = EXCLUDED.department_id,
         phone = EXCLUDED.phone, avatar = EXCLUDED.avatar,
         is_active = EXCLUDED.is_active, load = EXCLUDED.load,
         created_at = EXCLUDED.created_at,
         must_change_password = EXCLUDED.must_change_password,
         password_updated_at = EXCLUDED.password_updated_at,
         sort_order = EXCLUDED.sort_order`,
      [
        user.id, user.firstName, user.lastName, String(user.email).toLowerCase(), user.passwordHash,
        user.role, user.departmentId, user.phone || "", user.avatar || "", user.isActive !== false,
        Number(user.load || 0), user.createdAt || null, Boolean(user.mustChangePassword),
        user.passwordUpdatedAt || null, sortOrder,
      ],
    );
  }

  for (const [sortOrder, task] of data.tasks.entries()) {
    const dueDate = databaseDate(task.dueDate || task.dueDateLabel);
    await client.query(
      `INSERT INTO tasks (
         id, title, description, task_type, consolidation_type, product_type,
         batch_number, quantity, production_line, department_id,
         assigned_employee_id, verifier_id, supervisor_id, priority, status,
         estimated_duration, due_date, due_date_label, due_date_change_request, attachments,
         created_by, created_at, started_at, completed_at, approved_at,
         refusal_count, client_request_id, sort_order
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20::jsonb, $21, $22, $23, $24, $25, $26, $27, $28
       )
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description,
         task_type = EXCLUDED.task_type, consolidation_type = EXCLUDED.consolidation_type,
         product_type = EXCLUDED.product_type, batch_number = EXCLUDED.batch_number,
         quantity = EXCLUDED.quantity, production_line = EXCLUDED.production_line,
         department_id = EXCLUDED.department_id,
         assigned_employee_id = EXCLUDED.assigned_employee_id,
         verifier_id = EXCLUDED.verifier_id, supervisor_id = EXCLUDED.supervisor_id,
         priority = EXCLUDED.priority, status = EXCLUDED.status,
         estimated_duration = EXCLUDED.estimated_duration, due_date = EXCLUDED.due_date,
         due_date_label = EXCLUDED.due_date_label,
         due_date_change_request = EXCLUDED.due_date_change_request,
         attachments = EXCLUDED.attachments, created_by = EXCLUDED.created_by,
         created_at = EXCLUDED.created_at, started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at, approved_at = EXCLUDED.approved_at,
         refusal_count = EXCLUDED.refusal_count,
         client_request_id = EXCLUDED.client_request_id, sort_order = EXCLUDED.sort_order`,
      [
        task.id, task.title, task.description || "", task.taskType || "normal",
        task.consolidationType || "", task.productType || "", task.batchNumber || "",
        Number(task.quantity || 1), task.productionLine || "", task.departmentId,
        task.assignedEmployeeId || null, task.verifierId || task.supervisorId || null,
        task.supervisorId || task.verifierId || null, task.priority || "", task.status,
        task.estimatedDuration || "1h", dueDate, task.dueDateLabel || dueDate || "",
        task.dueDateChangeRequest || "", JSON.stringify(task.attachments || []),
        task.createdBy || null, task.createdAt, task.startedAt || null,
        task.completedAt || null, task.approvedAt || null, Number(task.refusalCount || 0),
        task.clientRequestId || "", sortOrder,
      ],
    );
  }

  await client.query("DELETE FROM task_responsibles");
  await client.query("DELETE FROM task_notes");
  for (const task of data.tasks) {
    for (const [position, userId] of task.responsibleIds.entries()) {
      await client.query(
        "INSERT INTO task_responsibles (task_id, user_id, position) VALUES ($1, $2, $3)",
        [task.id, userId, position],
      );
    }
    for (const [position, note] of task.notes.entries()) {
      await client.query(
        `INSERT INTO task_notes (task_id, id, message, created_by, created_at, position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [task.id, note.id, note.message, userIds.has(note.createdBy) ? note.createdBy : null, note.createdAt, position],
      );
    }
  }

  for (const [sortOrder, activity] of data.activities.entries()) {
    await client.query(
      `INSERT INTO activities (id, message, time_label, actor_id, created_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         message = EXCLUDED.message, time_label = EXCLUDED.time_label,
         actor_id = EXCLUDED.actor_id, created_at = EXCLUDED.created_at,
         sort_order = EXCLUDED.sort_order`,
      [activity.id, activity.message, activity.time || "", userIds.has(activity.actorId) ? activity.actorId : null, activity.createdAt || null, sortOrder],
    );
  }

  for (const [sortOrder, report] of data.reports.entries()) {
    await client.query(
      `INSERT INTO reports (id, name, description, status, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         status = EXCLUDED.status, sort_order = EXCLUDED.sort_order`,
      [report.id, report.name, report.description || "", report.status || "Ready", sortOrder],
    );
  }

  for (const [sortOrder, notification] of data.notifications.entries()) {
    await client.query(
      `INSERT INTO notifications (id, user_id, task_id, message, is_read, created_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id, task_id = EXCLUDED.task_id,
         message = EXCLUDED.message, is_read = EXCLUDED.is_read,
         created_at = EXCLUDED.created_at, sort_order = EXCLUDED.sort_order`,
      [notification.id, userIds.has(notification.userId) ? notification.userId : null, notification.taskId || null, notification.message, Boolean(notification.isRead), notification.createdAt || null, sortOrder],
    );
  }

  for (const [sortOrder, session] of data.sessions.entries()) {
    await client.query(
      `INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, user_agent, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         token_hash = EXCLUDED.token_hash, user_id = EXCLUDED.user_id,
         created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at,
         user_agent = EXCLUDED.user_agent, sort_order = EXCLUDED.sort_order`,
      [session.id, session.tokenHash, session.userId, session.createdAt, session.expiresAt, session.userAgent || "", sortOrder],
    );
  }

  for (const [sortOrder, entry] of data.auditLog.entries()) {
    await client.query(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         actor_id = EXCLUDED.actor_id, action = EXCLUDED.action,
         target_type = EXCLUDED.target_type, target_id = EXCLUDED.target_id,
         details = EXCLUDED.details, created_at = EXCLUDED.created_at,
         sort_order = EXCLUDED.sort_order`,
      [entry.id, userIds.has(entry.actorId) ? entry.actorId : null, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.details || {}), entry.createdAt, sortOrder],
    );
  }

  await deleteMissing(client, "activities", data.activities.map((item) => item.id));
  await deleteMissing(client, "reports", data.reports.map((item) => item.id));
  await deleteMissing(client, "notifications", data.notifications.map((item) => item.id));
  await deleteMissing(client, "sessions", data.sessions.map((item) => item.id));
  await deleteMissing(client, "audit_log", data.auditLog.map((item) => item.id));
  await deleteMissing(client, "tasks", data.tasks.map((item) => item.id));
  await deleteMissing(client, "users", data.users.map((item) => item.id));
  await deleteMissing(client, "departments", data.departments.map((item) => item.id));

  return data;
}

async function loadData(client) {
  const settings = await client.query("SELECT value FROM app_settings WHERE key = 'kpis'");
  const weekly = await client.query("SELECT day, value FROM weekly_production ORDER BY position");
  const departments = await client.query("SELECT * FROM departments ORDER BY sort_order, id");
  const users = await client.query("SELECT * FROM users ORDER BY sort_order, id");
  const tasks = await client.query("SELECT * FROM tasks ORDER BY sort_order, id");
  const responsibles = await client.query("SELECT * FROM task_responsibles ORDER BY task_id, position");
  const notes = await client.query("SELECT * FROM task_notes ORDER BY task_id, position");
  const activities = await client.query("SELECT * FROM activities ORDER BY sort_order, id");
  const reports = await client.query("SELECT * FROM reports ORDER BY sort_order, id");
  const notifications = await client.query("SELECT * FROM notifications ORDER BY sort_order, id");
  const sessions = await client.query("SELECT * FROM sessions WHERE expires_at > NOW() ORDER BY sort_order, id");
  const auditLog = await client.query("SELECT * FROM audit_log ORDER BY sort_order, id");

  const responsibleMap = new Map();
  for (const row of responsibles.rows) {
    const values = responsibleMap.get(row.task_id) || [];
    values.push(row.user_id);
    responsibleMap.set(row.task_id, values);
  }
  const noteMap = new Map();
  for (const row of notes.rows) {
    const values = noteMap.get(row.task_id) || [];
    values.push({
      id: row.id,
      message: row.message,
      createdBy: row.created_by || undefined,
      createdAt: iso(row.created_at),
    });
    noteMap.set(row.task_id, values);
  }

  return {
    kpis: settings.rows[0]?.value || {},
    weeklyProduction: weekly.rows.map((row) => ({ day: row.day, value: Number(row.value) })),
    departments: departments.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      capacity: row.capacity,
    })),
    users: users.rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role,
      departmentId: row.department_id,
      phone: row.phone,
      avatar: row.avatar,
      isActive: row.is_active,
      load: row.load,
      createdAt: iso(row.created_at),
      mustChangePassword: row.must_change_password,
      passwordUpdatedAt: iso(row.password_updated_at),
    })),
    tasks: tasks.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      taskType: row.task_type,
      consolidationType: row.consolidation_type,
      productType: row.product_type,
      batchNumber: row.batch_number,
      quantity: Number(row.quantity),
      productionLine: row.production_line,
      departmentId: row.department_id,
      assignedEmployeeId: row.assigned_employee_id,
      responsibleIds: responsibleMap.get(row.id) || [row.assigned_employee_id].filter(Boolean),
      verifierId: row.verifier_id,
      supervisorId: row.supervisor_id,
      priority: row.priority,
      status: row.status,
      estimatedDuration: row.estimated_duration,
      dueDate: dateOnly(row.due_date),
      dueDateLabel: row.due_date_label || dateOnly(row.due_date),
      dueDateChangeRequest: row.due_date_change_request,
      attachments: row.attachments || [],
      createdBy: row.created_by,
      createdAt: iso(row.created_at),
      startedAt: iso(row.started_at),
      completedAt: iso(row.completed_at),
      approvedAt: iso(row.approved_at),
      notes: noteMap.get(row.id) || [],
      refusalCount: row.refusal_count,
      clientRequestId: row.client_request_id,
    })),
    activities: activities.rows.map((row) => ({
      id: row.id,
      message: row.message,
      time: row.time_label,
      actorId: row.actor_id,
      createdAt: iso(row.created_at),
    })),
    reports: reports.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
    })),
    notifications: notifications.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      taskId: row.task_id,
      message: row.message,
      isRead: row.is_read,
      createdAt: iso(row.created_at),
    })),
    sessions: sessions.rows.map((row) => ({
      id: row.id,
      tokenHash: row.token_hash,
      userId: row.user_id,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
      userAgent: row.user_agent,
    })),
    auditLog: auditLog.rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details || {},
      createdAt: iso(row.created_at),
    })),
  };
}

async function initialize() {
  await runMigrations(postgresPool);
  if (!DATABASE_AUTO_SEED) return;
  const count = await postgresPool.query("SELECT COUNT(*)::int AS count FROM departments");
  if (count.rows[0].count > 0) return;
  const seed = JSON.parse(await readFile(SEED_FILE, "utf8"));
  const client = await postgresPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('richbond_application_data'))");
    await persistData(client, seed);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureDatabase() {
  if (!initializationPromise) {
    initializationPromise = initialize().catch((error) => {
      initializationPromise = undefined;
      throw error;
    });
  }
  await initializationPromise;
}

export async function readDatabase() {
  await ensureDatabase();
  const client = await postgresPool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const data = await loadData(client);
    await client.query("COMMIT");
    return structuredClone(data);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function writeDatabase(data) {
  await ensureDatabase();
  const client = await postgresPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('richbond_application_data'))");
    await persistData(client, structuredClone(data));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateDatabase(mutator) {
  await ensureDatabase();
  const client = await postgresPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('richbond_application_data'))");
    const data = await loadData(client);
    const result = await mutator(data);
    await persistData(client, data);
    await client.query("COMMIT");
    return structuredClone(result);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const databaseEngine = "postgresql";
export async function checkDatabase() {
  await ensureDatabase();
  await postgresPool.query("SELECT 1");
  return true;
}
export const closeDatabase = closePostgresPool;
