import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATABASE_DIR, DATABASE_FILE, SEED_FILE } from "../config/env.js";
import { hashPassword, isPasswordHash, LEGACY_INITIAL_PASSWORD } from "../security/passwords.js";
import { canonicalRole } from "../utils/roles.js";

let databaseQueue = Promise.resolve();

function enqueue(operation) {
  const result = databaseQueue.then(operation, operation);
  databaseQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function ensureDatabase() {
  if (existsSync(DATABASE_FILE)) return;

  await mkdir(DATABASE_DIR, { recursive: true });
  const seed = await readFile(SEED_FILE, "utf8");
  await writeFile(DATABASE_FILE, seed);
}

async function normalizeDatabase(data) {
  let changed = false;
  const collectionNames = ["departments", "users", "tasks", "activities", "reports", "notifications", "sessions", "auditLog"];
  for (const name of collectionNames) {
    if (!Array.isArray(data[name])) {
      data[name] = [];
      changed = true;
    }
  }

  const now = Date.now();
  const activeSessions = data.sessions.filter((session) => Date.parse(session.expiresAt) > now);
  if (activeSessions.length !== data.sessions.length) {
    data.sessions = activeSessions;
    changed = true;
  }

  await Promise.all(data.users.map(async (user) => {
    const normalizedRole = canonicalRole(user.role);
    if (user.role !== normalizedRole) {
      user.role = normalizedRole;
      changed = true;
    }
    if (!isPasswordHash(user.passwordHash)) {
      user.passwordHash = await hashPassword(LEGACY_INITIAL_PASSWORD);
      user.mustChangePassword = true;
      user.passwordUpdatedAt = null;
      changed = true;
    } else if (typeof user.mustChangePassword !== "boolean") {
      user.mustChangePassword = false;
      changed = true;
    }
  }));

  for (const task of data.tasks) {
    if (typeof task.rejectionReason !== "string") {
      task.rejectionReason = "";
      changed = true;
    }
    if (!Object.hasOwn(task, "rejectedBy")) {
      task.rejectedBy = null;
      changed = true;
    }
    if (!Object.hasOwn(task, "rejectedAt")) {
      task.rejectedAt = null;
      changed = true;
    }
    if (!Number.isInteger(task.refusalCount) || task.refusalCount < 0) {
      task.refusalCount = 0;
      changed = true;
    }
  }

  return changed;
}

async function writeDatabaseFile(data) {
  await mkdir(DATABASE_DIR, { recursive: true });
  const temporaryFile = path.join(DATABASE_DIR, `.richbond-db-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(temporaryFile, DATABASE_FILE);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
}

async function readDatabaseFile() {
  await ensureDatabase();
  const data = JSON.parse(await readFile(DATABASE_FILE, "utf8"));
  if (await normalizeDatabase(data)) await writeDatabaseFile(data);
  return data;
}

export async function readDatabase() {
  return enqueue(async () => structuredClone(await readDatabaseFile()));
}

export async function writeDatabase(data) {
  return enqueue(async () => {
    await writeDatabaseFile(structuredClone(data));
  });
}

export async function updateDatabase(mutator) {
  return enqueue(async () => {
    const data = await readDatabaseFile();
    const result = await mutator(data);
    await writeDatabaseFile(data);
    return structuredClone(result);
  });
}

function userWithDepartment(data, user) {
  const department = data.departments.find((item) => item.id === user.departmentId);
  return {
    ...user,
    departmentName: department?.name || "Operations",
  };
}

export async function findUserForLogin(email) {
  const normalizedEmail = String(email || "").toLowerCase();
  const data = await readDatabase();
  const user = data.users.find(
    (item) => String(item.email || "").toLowerCase() === normalizedEmail && item.isActive !== false,
  );
  return user ? userWithDepartment(data, user) : null;
}

export async function findAuthentication(tokenHash) {
  if (!tokenHash) return null;
  const data = await readDatabase();
  const session = data.sessions.find(
    (item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now(),
  );
  const user = session
    ? data.users.find((item) => item.id === session.userId && item.isActive !== false)
    : null;
  return session && user ? { session, user: userWithDepartment(data, user) } : null;
}

export async function commitLogin({ session, auditEntry }) {
  return updateDatabase((data) => {
    const now = Date.now();
    const activeSessions = (data.sessions || []).filter((item) => Date.parse(item.expiresAt) > now);
    const otherSessions = activeSessions.filter((item) => item.userId !== session.userId);
    const userSessions = activeSessions
      .filter((item) => item.userId === session.userId)
      .slice(-4);
    data.sessions = [...otherSessions, ...userSessions, session];
    data.auditLog = [auditEntry, ...(data.auditLog || [])].slice(0, 2000);
  });
}

export async function commitLogout({ sessionId, auditEntry }) {
  return updateDatabase((data) => {
    data.sessions = (data.sessions || []).filter((session) => session.id !== sessionId);
    data.auditLog = [auditEntry, ...(data.auditLog || [])].slice(0, 2000);
  });
}

export async function commitPasswordChange({
  userId,
  passwordHash,
  passwordUpdatedAt,
  exceptSessionId,
  auditEntry,
}) {
  return updateDatabase((data) => {
    const user = data.users.find((item) => item.id === userId && item.isActive !== false);
    if (!user) throw new Error("Utilisateur actif introuvable.");
    user.passwordHash = passwordHash;
    user.mustChangePassword = false;
    user.passwordUpdatedAt = passwordUpdatedAt;
    data.sessions = (data.sessions || []).filter(
      (session) => session.userId !== userId || session.id === exceptSessionId,
    );
    data.auditLog = [auditEntry, ...(data.auditLog || [])].slice(0, 2000);
  });
}

export const databaseEngine = "json";

export async function checkDatabase() {
  await ensureDatabase();
  return true;
}

export async function closeDatabase() {}
