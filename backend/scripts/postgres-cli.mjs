import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATABASE_FILE } from "../src/config/env.js";
import { auditDatabase } from "../src/database/databaseMaintenance.js";
import { closeDatabase, ensureDatabase, readDatabase, writeDatabase } from "../src/database/database.js";
import { postgresPool } from "../src/database/postgresPool.js";

const [command = "status", ...args] = process.argv.slice(2);

function option(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function resolveCliPath(value, fallback) {
  if (!value) return path.resolve(fallback);
  return path.resolve(process.env.INIT_CWD || process.cwd(), value);
}

function printAudit(audit) {
  console.log(JSON.stringify(audit.summary, null, 2));
  for (const warning of audit.warnings) console.warn(`AVERTISSEMENT : ${warning}`);
  for (const error of audit.errors) console.error(`ERREUR : ${error}`);
  console.log(audit.ok ? "Base valide." : "Base invalide.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL est obligatoire pour les commandes PostgreSQL.");
}

try {
  if (command === "migrate") {
    await ensureDatabase();
    console.log("Migrations PostgreSQL appliquées.");
  } else if (command === "status") {
    await ensureDatabase();
    const result = await postgresPool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM departments) AS departments,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM tasks) AS tasks,
        (SELECT COUNT(*)::int FROM activities) AS activities,
        (SELECT COUNT(*)::int FROM reports) AS reports,
        (SELECT COUNT(*)::int FROM notifications) AS notifications,
        (SELECT COUNT(*)::int FROM sessions) AS sessions,
        (SELECT COUNT(*)::int FROM audit_log) AS audit_entries
    `);
    console.log(JSON.stringify(result.rows[0], null, 2));
  } else if (command === "import-json") {
    if (!args.includes("--confirm")) {
      throw new Error("Utilisation : import-json --file <base.json> --confirm");
    }
    const sourceFile = resolveCliPath(option("--file"), DATABASE_FILE);
    const data = JSON.parse(await readFile(sourceFile, "utf8"));
    data.sessions = [];
    const sourceAudit = auditDatabase({ ...data, sessions: [] });
    if (!sourceAudit.ok) throw new Error(`Import refusé : ${sourceAudit.errors.join(" ")}`);
    await writeDatabase(data);
    const imported = await readDatabase();
    const importedAudit = auditDatabase(imported);
    printAudit(importedAudit);
    if (!importedAudit.ok) process.exitCode = 1;
    console.log(`Import terminé depuis ${sourceFile}. Les sessions locales n'ont pas été copiées.`);
  } else if (command === "audit") {
    const audit = auditDatabase(await readDatabase());
    printAudit(audit);
    if (!audit.ok) process.exitCode = 1;
  } else if (command === "export-json") {
    const targetFile = resolveCliPath(
      option("--file"),
      path.resolve(process.env.INIT_CWD || process.cwd(), `richbond-postgres-${Date.now()}.json`),
    );
    const data = await readDatabase();
    data.sessions = [];
    await writeFile(targetFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    console.log(`Export JSON créé : ${targetFile}`);
  } else {
    throw new Error("Commande inconnue. Utilisez migrate, status, import-json, audit ou export-json.");
  }
} finally {
  await closeDatabase();
}
