import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isPasswordHash } from "../security/passwords.js";

const REQUIRED_COLLECTIONS = ["departments", "users", "tasks", "activities", "reports", "notifications", "sessions", "auditLog"];
const TASK_STATUSES = new Set(["Pending", "Ready", "In Progress", "On Hold", "Waiting for Review", "Completed", "Blocked", "Cancelled", "Rejected"]);

function duplicateValues(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const value = selector(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function responsibleIds(task) {
  return Array.isArray(task.responsibleIds) && task.responsibleIds.length
    ? task.responsibleIds
    : [task.assignedEmployeeId].filter(Boolean);
}

export function auditDatabase(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["La racine de la base doit être un objet JSON."], warnings, summary: {} };
  }

  for (const collection of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(data[collection])) errors.push(`La collection '${collection}' est absente ou invalide.`);
  }
  if (errors.length) return { ok: false, errors, warnings, summary: {} };

  for (const collection of REQUIRED_COLLECTIONS) {
    for (const id of duplicateValues(data[collection], (item) => String(item?.id || "").trim())) {
      errors.push(`Identifiant dupliqué dans '${collection}' : ${id}.`);
    }
  }

  for (const email of duplicateValues(data.users, (user) => String(user?.email || "").trim().toLowerCase())) {
    errors.push(`Adresse e-mail utilisée par plusieurs utilisateurs : ${email}.`);
  }
  for (const name of duplicateValues(data.departments, (department) => String(department?.name || "").trim().toLowerCase())) {
    errors.push(`Nom de département dupliqué : ${name}.`);
  }

  const departmentIds = new Set(data.departments.map((item) => item.id));
  const userIds = new Set(data.users.map((item) => item.id));
  const taskIds = new Set(data.tasks.map((item) => item.id));

  for (const user of data.users) {
    if (!user.id || !user.email || !user.firstName || !user.lastName) errors.push(`Utilisateur incomplet : ${user.id || "sans identifiant"}.`);
    if (!departmentIds.has(user.departmentId)) errors.push(`Utilisateur ${user.id} rattaché à un département absent : ${user.departmentId}.`);
    if (!isPasswordHash(user.passwordHash)) warnings.push(`Utilisateur ${user.id} avec mot de passe ancien à migrer au prochain démarrage.`);
  }

  for (const task of data.tasks) {
    if (!task.id || !task.title) errors.push(`Tâche incomplète : ${task.id || "sans identifiant"}.`);
    if (!departmentIds.has(task.departmentId)) errors.push(`Tâche ${task.id} rattachée à un département absent : ${task.departmentId}.`);
    for (const userId of responsibleIds(task)) {
      if (!userIds.has(userId)) errors.push(`Tâche ${task.id} affectée à un utilisateur absent : ${userId}.`);
    }
    const verifierId = task.verifierId || task.supervisorId;
    if (verifierId && !userIds.has(verifierId)) errors.push(`Tâche ${task.id} rattachée à un vérificateur absent : ${verifierId}.`);
    if (task.createdBy && !userIds.has(task.createdBy)) errors.push(`Tâche ${task.id} créée par un utilisateur absent : ${task.createdBy}.`);
    if (!TASK_STATUSES.has(task.status)) errors.push(`Tâche ${task.id} avec statut inconnu : ${task.status}.`);
  }

  for (const notification of data.notifications) {
    if (notification.userId && !userIds.has(notification.userId)) warnings.push(`Notification ${notification.id} destinée à un utilisateur absent.`);
    if (notification.taskId && !taskIds.has(notification.taskId)) warnings.push(`Notification ${notification.id} rattachée à une tâche absente.`);
  }
  for (const session of data.sessions) {
    if (!userIds.has(session.userId)) errors.push(`Session ${session.id} rattachée à un utilisateur absent.`);
    if (!session.tokenHash || !session.expiresAt) errors.push(`Session ${session.id} incomplète.`);
    else if (Date.parse(session.expiresAt) <= Date.now()) warnings.push(`Session ${session.id} expirée et prête à être purgée.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      departments: data.departments.length,
      users: data.users.length,
      tasks: data.tasks.length,
      activities: data.activities.length,
      reports: data.reports.length,
      notifications: data.notifications.length,
      sessions: data.sessions.length,
      auditEntries: data.auditLog.length,
    },
  };
}

export async function loadDatabaseFile(file) {
  const raw = await readFile(file, "utf8");
  return { raw, data: JSON.parse(raw) };
}

function backupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function createDatabaseBackup({ sourceFile, backupDir, now = new Date() }) {
  const { raw, data } = await loadDatabaseFile(sourceFile);
  const audit = auditDatabase(data);
  await mkdir(backupDir, { recursive: true });
  const filename = `richbond-db-${backupTimestamp(now)}.json`;
  const backupFile = path.join(backupDir, filename);
  const temporaryFile = `${backupFile}.${randomUUID()}.tmp`;
  const digest = createHash("sha256").update(raw).digest("hex");
  await writeFile(temporaryFile, raw, "utf8");
  await rename(temporaryFile, backupFile);
  await writeFile(`${backupFile}.sha256`, `${digest}  ${filename}\n`, "utf8");
  return { backupFile, digest, audit };
}

export async function restoreDatabaseBackup({ backupFile, targetFile, backupDir }) {
  const { raw, data } = await loadDatabaseFile(backupFile);
  const audit = auditDatabase(data);
  if (!audit.ok) throw new Error(`Sauvegarde refusée : ${audit.errors.join(" ")}`);

  const safetyBackup = await createDatabaseBackup({ sourceFile: targetFile, backupDir });
  const temporaryFile = `${targetFile}.${randomUUID()}.restore.tmp`;
  await writeFile(temporaryFile, raw, "utf8");
  await rename(temporaryFile, targetFile);
  return { targetFile, safetyBackup: safetyBackup.backupFile, audit };
}
