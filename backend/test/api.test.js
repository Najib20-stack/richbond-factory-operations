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
    { id: "a1", firstName: "Amine", lastName: "Admin", email: "admin@test.local", passwordHash: secureHash, mustChangePassword: false, role: "Administrateur", departmentId: "d1", isActive: true, load: 0 },
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
  let administrator;
  let supervisor;
  let secondSupervisor;
  let employee;
  let otherEmployee;
  let task;
  let unrelatedTask;

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
    assert.deepEqual(accessible.payload.users.map((user) => user.id), ["s1", "s2", "e1", "e2"]);
    assert.ok(accessible.payload.users.every((user) => user.role === "Vérificateur/Responsable"));
    assert.deepEqual(accessible.payload.reports, []);

    const logout = await api("/api/logout", { method: "POST", token: temporary.token });
    assert.equal(logout.response.status, 200);
    const revoked = await api("/api/bootstrap", { token: temporary.token });
    assert.equal(revoked.response.status, 401);

    const oldPassword = await api("/api/login", { method: "POST", body: { email: "imane@test.local", password: "richbond123" } });
    assert.equal(oldPassword.response.status, 401);
    otherEmployee = await login("imane@test.local", "NewSecure2Pass");
  });

  await context.test("unifie les anciens rôles dans un même espace sécurisé", async () => {
    administrator = await login("admin@test.local");
    supervisor = await login("nadia@test.local");
    secondSupervisor = await login("samira@test.local");
    employee = await login("youssef@test.local");

    const employeeBootstrap = await api("/api/bootstrap", { token: employee.token });
    assert.equal(employeeBootstrap.response.status, 200);
    assert.deepEqual(employeeBootstrap.payload.users.map((user) => user.id), ["s1", "s2", "e1", "e2"]);
    assert.deepEqual(employeeBootstrap.payload.reports, []);
    assert.ok(employeeBootstrap.payload.users.every((user) => user.roleKey === "combined"));
    assert.equal(JSON.stringify(employeeBootstrap.payload).includes("passwordHash"), false);
    assert.equal(JSON.stringify(employeeBootstrap.payload).includes("tokenHash"), false);

    const hiddenUsers = await api("/api/users", { token: employee.token });
    assert.equal(hiddenUsers.response.status, 403);
    assert.equal(hiddenUsers.payload.code, "FORBIDDEN");
    const forbiddenUserCreation = await api("/api/users", {
      method: "POST",
      token: employee.token,
      body: { firstName: "Ali" },
    });
    assert.equal(forbiddenUserCreation.response.status, 403);
    assert.equal(forbiddenUserCreation.payload.code, "FORBIDDEN");

    const administratorBootstrap = await api("/api/bootstrap", { token: administrator.token });
    assert.equal(administratorBootstrap.response.status, 200);
    assert.deepEqual(administratorBootstrap.payload.users.map((user) => user.id), ["a1", "s1", "s2", "e1", "e2"]);
    assert.equal(administratorBootstrap.payload.users.find((user) => user.id === "a1").roleKey, "admin");
    assert.deepEqual(administratorBootstrap.payload.reports.map((report) => report.id), ["r1"]);

    const visibleUsers = await api("/api/users", { token: administrator.token });
    assert.equal(visibleUsers.response.status, 200);
    assert.equal(visibleUsers.payload.length, 5);
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
      dueDateLabel: "2026-08-10",
      clientRequestId: "request-001",
    };
    const created = await api("/api/tasks", { method: "POST", token: employee.token, body: payload });
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    assert.equal(created.payload.status, "Ready");
    assert.equal(created.payload.priority, "");
    task = created.payload;

    const replay = await api("/api/tasks", { method: "POST", token: employee.token, body: payload });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.payload.id, task.id);

    const unrelated = await api("/api/tasks", {
      method: "POST",
      token: supervisor.token,
      body: {
        ...payload,
        title: "Tâche du même département sans lien",
        responsibleIds: ["s2"],
        verifierId: "s1",
        clientRequestId: "request-unrelated",
      },
    });
    assert.equal(unrelated.response.status, 201, JSON.stringify(unrelated.payload));
    unrelatedTask = unrelated.payload;

    const listed = await api("/api/tasks", { token: employee.token });
    assert.deepEqual(listed.payload.map((item) => item.id), [task.id]);
    const secondSupervisorTasks = await api("/api/tasks", { token: secondSupervisor.token });
    assert.equal(secondSupervisorTasks.payload.some((item) => item.id === task.id), false);
    assert.equal(secondSupervisorTasks.payload.some((item) => item.id === unrelatedTask.id), true);
    const hidden = await api("/api/tasks", { token: otherEmployee.token });
    assert.equal(hidden.payload.some((item) => item.id === task.id), false);

    const administratorTasks = await api("/api/tasks", { token: administrator.token });
    assert.equal(administratorTasks.payload.some((item) => item.id === task.id), true);
    assert.equal(administratorTasks.payload.some((item) => item.id === unrelatedTask.id), true);
  });

  await context.test("applique les transitions et réserve la validation au vérificateur désigné", async () => {
    const crossUser = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: otherEmployee.token,
      body: { status: "In Progress" },
    });
    assert.equal(crossUser.response.status, 403);

    const verifierManagement = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: supervisor.token,
      body: { title: "Modification interdite" },
    });
    assert.equal(verifierManagement.response.status, 403);

    const administratorManagement = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: administrator.token,
      body: { title: "Contrôler le lot pilote - suivi administrateur" },
    });
    assert.equal(administratorManagement.response.status, 200);
    assert.equal(administratorManagement.payload.title, "Contrôler le lot pilote - suivi administrateur");

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

    const administratorCannotApprove = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: administrator.token,
      body: { status: "Completed", note: "Tentative administrateur." },
    });
    assert.equal(administratorCannotApprove.response.status, 403);

    const rejectionWithoutReason = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: supervisor.token,
      body: { status: "Rejected", note: "" },
    });
    assert.equal(rejectionWithoutReason.response.status, 400);
    assert.equal(rejectionWithoutReason.payload.code, "VALIDATION_ERROR");

    const rejectionReason = "La couture latérale doit être reprise avant une nouvelle vérification.";
    const rejected = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: supervisor.token,
      body: { status: "Rejected", note: rejectionReason },
    });
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.payload.status, "Rejected");
    assert.equal(rejected.payload.rejectionReason, rejectionReason);
    assert.equal(rejected.payload.rejectedBy, supervisor.user.id);
    assert.equal(rejected.payload.rejectedByName, `${supervisor.user.firstName} ${supervisor.user.lastName}`);
    assert.ok(rejected.payload.rejectedAt);
    assert.equal(rejected.payload.refusalCount, 1);

    const responsibleView = await api("/api/tasks", { token: employee.token });
    const visibleRejection = responsibleView.payload.find((item) => item.id === task.id);
    assert.equal(visibleRejection.rejectionReason, rejectionReason);

    const restarted = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: employee.token,
      body: { status: "In Progress", note: "Correction démarrée." },
    });
    assert.equal(restarted.response.status, 200);

    const resubmitted = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: employee.token,
      body: { status: "Waiting for Review", note: "Couture corrigée." },
    });
    assert.equal(resubmitted.response.status, 200);

    const approved = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      token: supervisor.token,
      body: { status: "Completed", note: "Travail conforme." },
    });
    assert.equal(approved.response.status, 200);
    assert.ok(approved.payload.approvedAt);
  });

  await context.test("réserve la gestion des comptes à l'administrateur et journalise les actions métier", async () => {
    const forbiddenCreateUser = await api("/api/users", {
      method: "POST",
      token: supervisor.token,
      body: { firstName: "Ali", lastName: "Test", email: "ali@test.local" },
    });
    assert.equal(forbiddenCreateUser.response.status, 403);
    assert.equal(forbiddenCreateUser.payload.code, "FORBIDDEN");

    const createdUser = await api("/api/users", {
      method: "POST",
      token: administrator.token,
      body: {
        firstName: "Ali",
        lastName: "Test",
        email: "ali@test.local",
        role: "Vérificateur/Responsable",
        departmentId: "d2",
        temporaryPassword: "Temporary3Pass",
      },
    });
    assert.equal(createdUser.response.status, 201, JSON.stringify(createdUser.payload));
    assert.equal(createdUser.payload.role, "Vérificateur/Responsable");
    assert.equal(createdUser.payload.requiresPasswordChange, true);

    const updateUser = await api(`/api/users/${createdUser.payload.id}`, {
      method: "PATCH",
      token: administrator.token,
      body: { isActive: false },
    });
    assert.equal(updateUser.response.status, 200);
    assert.equal(updateUser.payload.isActive, false);

    const selfDeactivation = await api("/api/users/a1", {
      method: "PATCH",
      token: administrator.token,
      body: { isActive: false },
    });
    assert.equal(selfDeactivation.response.status, 400);
    assert.equal(selfDeactivation.payload.code, "SELF_DEACTIVATION");

    const duplicateDepartment = await api("/api/departments", {
      method: "POST",
      token: supervisor.token,
      body: { name: "production", description: "Doublon", capacity: 20 },
    });
    assert.equal(duplicateDepartment.response.status, 409);

    const stored = JSON.parse(await readFile(path.join(databaseDir, "richbond-db.json"), "utf8"));
    assert.ok(stored.users.every((user) => user.passwordHash.startsWith("scrypt$")));
    assert.ok(stored.users.every((user) => ["Vérificateur/Responsable", "Administrateur"].includes(user.role)));
    assert.ok(stored.users.some((user) => user.role === "Administrateur"));
    assert.ok(stored.sessions.every((session) => session.tokenHash && !Object.hasOwn(session, "token")));
    assert.ok(stored.auditLog.some((entry) => entry.action === "task.created"));
    assert.ok(stored.auditLog.some((entry) => entry.action === "task.updated"));
    assert.ok(stored.auditLog.some((entry) => entry.action === "user.created"));
    assert.ok(stored.auditLog.some((entry) => entry.action === "user.updated"));
    assert.ok(stored.auditLog.some((entry) => entry.action === "auth.password_changed"));
  });
});
