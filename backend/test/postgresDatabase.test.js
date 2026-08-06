import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "../src/security/passwords.js";

const testDatabaseUrl = String(process.env.TEST_DATABASE_URL || "");

test("les migrations et l'adaptateur PostgreSQL conservent les données", {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.toLowerCase();
  assert.match(databaseName, /test/, "TEST_DATABASE_URL doit cibler une base dédiée aux tests.");
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_SSL_MODE = process.env.TEST_DATABASE_SSL_MODE || "disable";

  const database = await import("../src/database/database.js");
  const fixture = {
    kpis: { efficiency: 93 },
    weeklyProduction: [{ day: "Lun", value: 72 }],
    departments: [{ id: "pg-d1", name: "Production", description: "Département de test", capacity: 70 }],
    users: [
      {
        id: "pg-u1",
        firstName: "Nadia",
        lastName: "Test",
        email: "nadia.pg@test.local",
        passwordHash: await hashPassword("SecurePass1"),
        role: "Superviseur",
        departmentId: "pg-d1",
        phone: "",
        avatar: "",
        isActive: true,
        load: 20,
        createdAt: "2026-08-03T10:00:00.000Z",
        mustChangePassword: false,
        passwordUpdatedAt: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "pg-a1",
        firstName: "Amine",
        lastName: "Admin",
        email: "admin.pg@test.local",
        passwordHash: await hashPassword("SecurePass1"),
        role: "Administrateur",
        departmentId: "pg-d1",
        phone: "",
        avatar: "",
        isActive: true,
        load: 0,
        createdAt: "2026-08-03T10:00:00.000Z",
        mustChangePassword: false,
        passwordUpdatedAt: "2026-08-03T10:00:00.000Z",
      },
    ],
    tasks: [{
      id: "PG-T1",
      title: "Contrôle PostgreSQL",
      description: "Validation de la persistance relationnelle.",
      taskType: "normal",
      consolidationType: "",
      productType: "",
      batchNumber: "",
      quantity: 1,
      productionLine: "",
      departmentId: "pg-d1",
      assignedEmployeeId: "pg-u1",
      responsibleIds: ["pg-u1"],
      verifierId: "pg-u1",
      supervisorId: "pg-u1",
      priority: "High",
      status: "Ready",
      estimatedDuration: "1h",
      dueDateLabel: "En retard",
      dueDateChangeRequest: "",
      attachments: [],
      createdBy: "pg-u1",
      createdAt: "2026-08-03T10:00:00.000Z",
      startedAt: null,
      completedAt: null,
      approvedAt: null,
      rejectionReason: "Écart de qualité sur la couture.",
      rejectedBy: "pg-u1",
      rejectedAt: "2026-08-03T11:00:00.000Z",
      notes: [],
      refusalCount: 0,
    }],
    activities: [],
    reports: [],
    notifications: [],
    sessions: [],
    auditLog: [],
  };

  try {
    await database.writeDatabase(fixture);
    const stored = await database.readDatabase();
    assert.equal(stored.departments[0].description, "Département de test");
    assert.equal(stored.tasks[0].responsibleIds[0], "pg-u1");
    assert.equal(stored.tasks[0].dueDate, "");
    assert.equal(stored.tasks[0].dueDateLabel, "En retard");
    assert.equal(stored.tasks[0].rejectionReason, "Écart de qualité sur la couture.");
    assert.equal(stored.tasks[0].rejectedBy, "pg-u1");
    assert.equal(stored.tasks[0].rejectedAt, "2026-08-03T11:00:00.000Z");
    assert.equal(stored.users.find((user) => user.id === "pg-a1").role, "Administrateur");

    const title = await database.updateDatabase((data) => {
      data.tasks[0].title = "Contrôle transactionnel";
      return data.tasks[0].title;
    });
    assert.equal(title, "Contrôle transactionnel");
    assert.equal((await database.readDatabase()).tasks[0].title, title);

    const loginUser = await database.findUserForLogin("NADIA.PG@TEST.LOCAL");
    assert.equal(loginUser.id, "pg-u1");
    assert.equal(loginUser.departmentName, "Production");

    const session = {
      id: "pg-session-1",
      tokenHash: "pg-test-token-hash",
      userId: "pg-u1",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      userAgent: "node-test",
    };
    await database.commitLogin({
      session,
      auditEntry: {
        id: "pg-audit-login",
        actorId: "pg-u1",
        action: "auth.login",
        targetType: "session",
        targetId: session.id,
        details: {},
        createdAt: new Date().toISOString(),
      },
    });
    const authentication = await database.findAuthentication(session.tokenHash);
    assert.equal(authentication.session.id, session.id);
    assert.equal(authentication.user.id, "pg-u1");

    const replacementHash = await hashPassword("ReplacementPass2");
    await database.commitPasswordChange({
      userId: "pg-u1",
      passwordHash: replacementHash,
      passwordUpdatedAt: new Date().toISOString(),
      exceptSessionId: session.id,
      auditEntry: {
        id: "pg-audit-password",
        actorId: "pg-u1",
        action: "auth.password_changed",
        targetType: "user",
        targetId: "pg-u1",
        details: {},
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal((await database.readDatabase()).users[0].passwordHash, replacementHash);

    await database.commitLogout({
      userId: "pg-u1",
      sessionId: session.id,
      auditEntry: {
        id: "pg-audit-logout",
        actorId: "pg-u1",
        action: "auth.logout",
        targetType: "session",
        targetId: session.id,
        details: {},
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal(await database.findAuthentication(session.tokenHash), null);
    assert.equal(await database.checkDatabase(), true);
  } finally {
    await database.closeDatabase();
  }
});
