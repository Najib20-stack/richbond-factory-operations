import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATABASE_SSL_MODE, DATABASE_URL, PROJECT_ROOT } from "../src/config/env.js";

if (!DATABASE_URL) throw new Error("DATABASE_URL est obligatoire pour sauvegarder PostgreSQL.");

const args = process.argv.slice(2);
function option(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.resolve(option("--backup-dir", path.join(PROJECT_ROOT, "backups", "postgres")));
const backupFile = path.resolve(option("--file", path.join(backupDir, `richbond-${timestamp}.dump`)));
await mkdir(path.dirname(backupFile), { recursive: true });

const url = new URL(DATABASE_URL);
const childEnvironment = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGSSLMODE: DATABASE_SSL_MODE === "disable" ? "disable" : DATABASE_SSL_MODE,
};

await new Promise((resolve, reject) => {
  const child = spawn("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    backupFile,
  ], { env: childEnvironment, stdio: ["ignore", "inherit", "inherit"] });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump a quitté avec le code ${code}.`)));
});

const digest = createHash("sha256").update(await readFile(backupFile)).digest("hex");
await writeFile(`${backupFile}.sha256`, `${digest}  ${path.basename(backupFile)}\n`, "utf8");
console.log(`Sauvegarde PostgreSQL créée : ${backupFile}`);
console.log(`SHA-256 : ${digest}`);
