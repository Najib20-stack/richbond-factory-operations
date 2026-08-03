import { existsSync } from "node:fs";
import path from "node:path";
import { DATABASE_FILE, PROJECT_ROOT, SEED_FILE } from "../src/config/env.js";
import { auditDatabase, createDatabaseBackup, loadDatabaseFile, restoreDatabaseBackup } from "../src/database/databaseMaintenance.js";

const [command = "audit", ...args] = process.argv.slice(2);

function option(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function resolveCliPath(value, fallback) {
  if (!value) return path.resolve(fallback);
  return path.resolve(process.env.INIT_CWD || process.cwd(), value);
}

const defaultDatabaseFile = existsSync(DATABASE_FILE) ? DATABASE_FILE : SEED_FILE;
const databaseFile = resolveCliPath(option("--database"), defaultDatabaseFile);
const backupDir = resolveCliPath(
  option("--backup-dir"),
  path.join(PROJECT_ROOT, "backups", "database"),
);

function printAudit(audit) {
  console.log(JSON.stringify(audit.summary, null, 2));
  for (const warning of audit.warnings) console.warn(`AVERTISSEMENT : ${warning}`);
  for (const error of audit.errors) console.error(`ERREUR : ${error}`);
  console.log(audit.ok ? "Base valide." : "Base invalide.");
}

if (command === "audit") {
  const { data } = await loadDatabaseFile(databaseFile);
  const audit = auditDatabase(data);
  printAudit(audit);
  if (!audit.ok) process.exitCode = 1;
} else if (command === "backup") {
  const result = await createDatabaseBackup({ sourceFile: databaseFile, backupDir });
  console.log(`Sauvegarde créée : ${result.backupFile}`);
  console.log(`SHA-256 : ${result.digest}`);
  printAudit(result.audit);
} else if (command === "restore") {
  const backupFile = option("--file");
  if (!backupFile || !args.includes("--confirm")) {
    throw new Error("Utilisation : restore --file <sauvegarde.json> --confirm");
  }
  const result = await restoreDatabaseBackup({
    backupFile: resolveCliPath(backupFile),
    targetFile: databaseFile,
    backupDir,
  });
  console.log(`Base restaurée : ${result.targetFile}`);
  console.log(`Sauvegarde de sécurité : ${result.safetyBackup}`);
  printAudit(result.audit);
} else {
  throw new Error("Commande inconnue. Utilisez audit, backup ou restore.");
}
