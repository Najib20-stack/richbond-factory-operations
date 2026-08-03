import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const databaseDir = await mkdtemp(path.join(tmpdir(), "richbond-api-test-"));
const seedFile = path.join(databaseDir, "seed.json");

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
process.env.DATABASE_DIR = databaseDir;
process.env.SEED_FILE = seedFile;
process.env.LOGIN_MAX_ATTEMPTS = "3";
process.env.LOGIN_WINDOW_MS = "60000";
process.env.LOGIN_LOCK_MS = "60000";
process.env.SESSION_TTL_MS = "3600000";

const { hashPassword } = await import("../src/security/passwords.js");
const secureHash = await hashPassword("SecurePass1");
const seed = {
  kpis: { efficiency: 91 },
  weeklyProduction: [],
  departments: [
    { id: "d1", name: "Production", description: "Lignes de production", capacity: 80 },
    { id: "d2", name: "Qualité", description: "Contrôle qualité", capacity: 40 },
  ],
  users: [
    { id: "s1", firstName: "Nadia", lastName: "Karimi", email: "nadia@test.local", passwordHash: secureHash, mustChangePassword: false, role: "Superviseur", departmentId: "d1", isActive: true, load: 30 },
    { id: "s2", firstName: "Samira", lastName: "Idrissi", email: "samira@test.local", passwordHash: secureHash, mustChangePassword: false, role: "Superviseur", departmentId: "d1", isActive: true, load: 25 },
    { id: "e1", firstName: "Youssef", lastName: "Amrani", email: "youssef@test.local", passwordHash: secureHash, mustChangePassword: false, role: "Employé", departmentId: "d1", isActive: true, load: 45 },
    { id: "e2", firstName: "Imane", lastName: "Berrada", email: "imane@test.local", passwordHash: "demo-only", role: "Employé", departmentId: "d2", isActive: true, load: 20 },
  ],
  tasks: [],
  activities: [],
  reports: [{ id: "r1", name: "Production", description: "Rapport", status: "Ready" }],
  notifications: [],
};
await writeFile(seedFile, `${JSON.stringify(seed, null, 2)}\n`, "utf8");

const { createServer } = await import("../src/app.js");
const { resetLoginProtectionForTests } = await import("../src/security/loginProtection.js");
const server = createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

async function api(pathname, { method = "GET", token = "", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  const payload = await response.json();
  return { response, payload };
}

async function login(email, password = "SecurePass1") {
  const result = await api("/api/login", { method: "POST", body: { email, password } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.ok(result.payload.token);
  return result.payload;
}

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(databaseDir, { recursive: true, force: true });
});

test("API sécurisée et workflow complet des tâches", async (context) => {
  let supervisor;
  let secondSupervisor;
  let employee;
  let otherEmployee;
  let task;

  await context.test("expose uniquement le contrôle de santé sans authentification", async () => {
    const health = await api("/api/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.ok, true);
    assert.equal(health.response.headers.get("x-content-type-options"), "nosniff");

    const allowedOrigin = await api("/api/health", { headers: { Origin: "http://localhost:5173" } });
    assert.equal(allowedOrigin.response.status, 200);
    assert.equal(allowedOrigin.response.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const sameHostOrigin = await api("/api/health", { headers: { Origin: "http://127.0.0.1:4567" } });
    assert.equal(sameHostOrigin.response.status, 200);
    assert.equal(sameHostOrigin.response.headers.get("access-control-allow-origin"), "http://127.0.0.1:4567");

    const forbiddenOrigin = await api("/api/health", { headers: { Origin: "https://untrusted.example" } });
    assert.equal(forbiddenOrigin.response.status, 403);
    assert.equal(forbiddenOrigin.payload.code, "ORIGIN_FORBIDDEN");

    const bootstrap = await api("/api/bootstrap");
    assert.equal(bootstrap.response.status, 401);
    assert.equal(bootstrap.payload.code, "AUTH_REQUIRED");
  });

  await context.test("bloque les tentatives répétées de connexion", async () => {
    resetLoginProtectionForTests();
    for (let index = 0; index < 3; index += 1) {
      const failure = await api("/api/login", { method: "POST", body: { email: "absent@test.local", password: "incorrect" } });
      assert.equal(failure.response.status, 401);
    }
    const blocked = await api("/api/login", { method: "POST", body: { email: "absent@test.local", password: "incorrect" } });
    assert.equal(blocked.response.status, 429);
    assert.equal(blocked.payload.code, "LOGIN_RATE_LIMITED");
    assert.ok(Number(blocked.response.headers.get("retry-after")) >= 1);
    resetLoginProtectionForTests();
  });

  await context.test("migre un ancien mot de passe et impose son remplacement", async () => {
    const temporary = await login("imane@test.local", "richbond123");
    assert.equal(temporary.user.requiresPasswordChange, true);

    const denied = await api("/api/bootstrap", { token: temporary.token });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.payload.code, "PASSWORD_CHANGE_REQUIRED");

    const weak = await api("/api/change-password", {
      method: "POST",
      token: temporary.token,
      body: { currentPassword: "richbond123", newPassword: "faible" },
    });
    assert.equal(weak.response.status, 400);
    assert.equal(weak.payload.code, "WEAK_PASSWORD");

    const changed = await api("/api/change-password", {
      method: "POST",
      token: temporary.token,
      body: { currentPassword: "richbond123", newPassword: "NewSecure2Pass" },
    });
    assert.equal(changed.response.status, 200);
    assert.equal(changed.payload.user.requiresPasswordChange, false);

    const accessible = await api("/api/bootstrap", { token: temporary.token });
    assert.equal(accessible.response.status, 200);
    assert.deepEqual(accessible.payload.users.map((user) => user.id), ["e2"]);

    const logout = await api("/api/logout", { method: "POST", token: temporary.token });
    assert.equal(logout.response.status, 200);
    const revoked = await api("/api/bootstrap", { token: temporary.token });
    assert.equal(revoked.response.status, 401);

    const oldPassword = await api("/api/login", { method: "POST", body: { email: "imane@test.local", password: "richbond123" } });
    assert.equal(oldPassword.response.status, 401);
    otherEmployee = await login("imane@test.local", "NewSecure2Pass");
  });

  await context.test("sépare les données et les permissions des rôles", async () => {
    supervisor = await login("nadia@test.local");
    secondSupervisor = await login("samira@test.local");
    employee = await login("youssef@test.local");

    const employeeBootstrap = await api("/api/bootstrap", { token: employee.token });
    assert.equal(employeeBootstrap.response.status, 200);
    assert.deepEqual(employeeBootstrap.payload.users.map((user) => user.id), ["e1"]);
    assert.deepEqual(employeeBootstrap.payload.activities, []);
    assert.deepEqual(employeeBootstrap.payload.reports, []);
    assert.equal(JSON.stringify(employeeBootstrap.payload).includes("passwordHash"), false);
    assert.equal(JSON.stringify(employeeBootstrap.payload).includes("tokenHash"), false);

    const forbiddenTask = await api("/api/tasks", { method: "POST", token: employee.token, body: {} });
    assert.equal(forbiddenTask.response.status, 403);
    const forbiddenUsers = await api("/api/users", { token: employee.token });
    assert.equal(forbiddenUsers.response.status, 403);
    const forbiddenDepartment = await api("/api/departments", { method: "POST", token: employee.token, body: { name: "Secret" } });
    assert.equal(forbiddenDepartment.response.status, 403);
  });

  await context.test("valide les entrées et rend la création de tâche idempotente", async () => {
    const invalid = await api("/api/tasks", {
      method: "POST",
      token: supervisor.token,
      body: { title: "X", unknown: true },
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.payload.code, "VALIDATION_ERROR");

    const payload = {
      title: "Contrôler le lot pilote",
      description: "Vérifier les mesures avant libération.",
      taskType: "normal",
      departmentId: "d1",
      responsibleIds: ["e1"],
      verifierId: "s1",
      priority: "High",
      estimatedDuration: "2h",
      dueDateLabel: "2026-08-10",
      clientRequestId: "request-001",
    };
    const created = await api("/api/tasks", { method: "POST", token: supervisor.token, body: payload });
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    assert.equal(created.payload.status, "Ready");
    task = created.payload;

    const replay = await api("/api/tasks", { method: "POST", token: supervisor.token, body: payload });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.payload.id, task.id);

    const listed = await api("/api/tasks", { token: employee.token });
    assert.deepEqual(listed.payload.map((item) => item.id), [task.id]);
    const hidden = await api("/api/tasks", { token: otherEmployee.token });
    assert.equal(hidden.payload.some((item) => item.id === task.id), false);
  });

  await context.test("applique les transitions et réserve la validation au vérificateur désigné", async () => {
    const crossUser = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: otherEmployee.token,
      body: { status: "In Progress" },
    });
    assert.equal(crossUser.response.status, 403);

    const skipped = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: employee.token,
      body: { status: "Waiting for Review" },
    });
    assert.equal(skipped.response.status, 409);
    assert.equal(skipped.payload.code, "INVALID_TRANSITION");

    const started = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: employee.token,
      body: { status: "In Progress", note: "Production démarrée." },
    });
    assert.equal(started.response.status, 200);
    assert.ok(started.payload.startedAt);

    const dateRequest = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: employee.token,
      body: { status: "In Progress", dueDateChangeRequest: "Arrêt planifié de la ligne." },
    });
    assert.equal(dateRequest.response.status, 200);
    assert.equal(dateRequest.payload.dueDateChangeRequest, "Arrêt planifié de la ligne.");

    const completed = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: employee.token,
      body: { status: "Waiting for Review", note: "Contrôle terminé." },
    });
    assert.equal(completed.response.status, 200);
    assert.ok(completed.payload.completedAt);

    const wrongVerifier = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: secondSupervisor.token,
      body: { status: "Completed", note: "Tentative de validation." },
    });
    assert.equal(wrongVerifier.response.status, 403);

    const approved = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: supervisor.token,
      body: { status: "Completed", note: "Travail conforme." },
    });
    assert.equal(approved.response.status, 200);
    assert.ok(approved.payload.approvedAt);
  });

  await context.test("protège la gestion des utilisateurs et journalise les actions", async () => {
    const weakUser = await api("/api/users", {
      method: "POST",
      token: supervisor.token,
      body: { firstName: "Ali", lastName: "Test", email: "ali@test.local", role: "Employé", departmentId: "d1", temporaryPassword: "faible" },
    });
    assert.equal(weakUser.response.status, 400);
    assert.equal(weakUser.payload.code, "WEAK_PASSWORD");

    const createdUser = await api("/api/users", {
      method: "POST",
      token: supervisor.token,
      body: { firstName: "Ali", lastName: "Test", email: "ali@test.local", role: "Employé", departmentId: "d1", temporaryPassword: "Temporary3Pass" },
    });
    assert.equal(createdUser.response.status, 201);
    assert.equal(createdUser.payload.requiresPasswordChange, true);
    assert.equal(Object.hasOwn(createdUser.payload, "passwordHash"), false);

    const duplicateDepartment = await api("/api/departments", {
      method: "POST",
      token: supervisor.token,
      body: { name: "production", description: "Doublon", capacity: 20 },
    });
    assert.equal(duplicateDepartment.response.status, 409);

    const stored = JSON.parse(await readFile(path.join(databaseDir, "richbond-db.json"), "utf8"));
    assert.ok(stored.users.every((user) => user.passwordHash.startsWith("scrypt$")));
    assert.ok(stored.sessions.every((session) => session.tokenHash && !Object.hasOwn(session, "token")));
    assert.ok(stored.auditLog.some((entry) => entry.action === "task.created"));
    assert.ok(stored.auditLog.some((entry) => entry.action === "task.updated"));
    assert.ok(stored.auditLog.some((entry) => entry.action === "auth.password_changed"));
  });
});
