import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATABASE_DIR, DATABASE_FILE, SEED_FILE } from "../config/env.js";
import { hashPassword, isPasswordHash, LEGACY_INITIAL_PASSWORD } from "../security/passwords.js";

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

export const databaseEngine = "json";

export async function checkDatabase() {
  await ensureDatabase();
  return true;
}

export async function closeDatabase() {}
