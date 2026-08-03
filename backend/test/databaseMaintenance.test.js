import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { auditDatabase, createDatabaseBackup, restoreDatabaseBackup } from "../src/database/databaseMaintenance.js";
import { hashPassword } from "../src/security/passwords.js";

async function fixture() {
  return {
    departments: [{ id: "d1", name: "Production" }],
    users: [{ id: "u1", firstName: "Ali", lastName: "Test", email: "ali@test.local", departmentId: "d1", passwordHash: await hashPassword("SecurePass1") }],
    tasks: [{ id: "t1", title: "Contrôle", departmentId: "d1", assignedEmployeeId: "u1", responsibleIds: ["u1"], verifierId: "u1", createdBy: "u1", status: "Ready" }],
    activities: [],
    reports: [],
    notifications: [],
    sessions: [],
    auditLog: [],
  };
}

test("l'audit détecte les collisions et les références cassées", async () => {
  const data = await fixture();
  data.users.push({ ...data.users[0], id: "u2" });
  data.tasks[0].responsibleIds = ["absent"];
  const audit = auditDatabase(data);
  assert.equal(audit.ok, false);
  assert.ok(audit.errors.some((message) => message.includes("plusieurs utilisateurs")));
  assert.ok(audit.errors.some((message) => message.includes("utilisateur absent")));
});

test("la sauvegarde et la restauration conservent une base valide", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "richbond-backup-test-"));
  try {
    const sourceFile = path.join(directory, "richbond-db.json");
    const backupDir = path.join(directory, "backups");
    const original = await fixture();
    await writeFile(sourceFile, `${JSON.stringify(original, null, 2)}\n`, "utf8");
    const backup = await createDatabaseBackup({ sourceFile, backupDir, now: new Date("2026-08-03T10:00:00Z") });
    assert.equal(backup.audit.ok, true);
    assert.match(backup.digest, /^[a-f0-9]{64}$/);
    assert.match(await readFile(`${backup.backupFile}.sha256`, "utf8"), new RegExp(backup.digest));

    const changed = { ...original, tasks: [] };
    await writeFile(sourceFile, `${JSON.stringify(changed, null, 2)}\n`, "utf8");
    const restored = await restoreDatabaseBackup({ backupFile: backup.backupFile, targetFile: sourceFile, backupDir });
    assert.equal(JSON.parse(await readFile(sourceFile, "utf8")).tasks.length, 1);
    assert.ok(restored.safetyBackup);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
