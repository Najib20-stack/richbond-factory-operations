import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DATABASE_DIR, DATABASE_FILE, SEED_FILE } from "../config/env.js";

export async function ensureDatabase() {
  if (existsSync(DATABASE_FILE)) return;

  await mkdir(DATABASE_DIR, { recursive: true });
  const seed = await readFile(SEED_FILE, "utf8");
  await writeFile(DATABASE_FILE, seed);
}

export async function readDatabase() {
  await ensureDatabase();
  return JSON.parse(await readFile(DATABASE_FILE, "utf8"));
}

export async function writeDatabase(data) {
  await writeFile(DATABASE_FILE, JSON.stringify(data, null, 2));
}
