import { randomBytes } from "node:crypto";
import { readDatabase, updateDatabase } from "../database/database.js";
import { clearLoginFailures, loginAvailability, recordLoginFailure } from "../security/loginProtection.js";
import { hashPassword, validateNewPassword, verifyPassword } from "../security/passwords.js";
import { createSession, revokeSession, revokeUserSessions } from "../security/sessions.js";
import { addAuditEntry } from "../utils/audit.js";
import { HttpError, readRequestBody, sendJson } from "../utils/http.js";
import { roleKey } from "../utils/roles.js";
import { rejectUnknownFields, text } from "../utils/validation.js";

const dummyHashPromise = hashPassword(randomBytes(24).toString("base64url"));

function sessionUser(data, user) {
  const department = data.departments.find((item) => item.id === user.departmentId);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    roleKey: roleKey(user.role),
    departmentId: user.departmentId,
    departmentName: department?.name || "Operations",
    requiresPasswordChange: Boolean(user.mustChangePassword),
  };
}

export async function login(request, response) {
  const body = await readRequestBody(request);
  rejectUnknownFields(body, ["email", "password"]);
  const email = text(body.email, "L'adresse e-mail", { required: true, max: 254 }).toLowerCase();
  const password = String(body.password || "");
  if (!password || password.length > 256) {
    sendJson(response, 401, { error: "Email ou mot de passe incorrect.", code: "INVALID_CREDENTIALS" });
    return;
  }

  const availability = loginAvailability(request, email);
  if (!availability.allowed) {
    response.setHeader("Retry-After", String(availability.retryAfterSeconds));
    sendJson(response, 429, {
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
      code: "LOGIN_RATE_LIMITED",
    });
    return;
  }

  const snapshot = await readDatabase();
  const candidate = snapshot.users.find((item) => item.email.toLowerCase() === email && item.isActive !== false);
  const passwordMatches = await verifyPassword(password, candidate?.passwordHash || await dummyHashPromise);

  if (!candidate || !passwordMatches) {
    recordLoginFailure(request, email);
    sendJson(response, 401, { error: "Email ou mot de passe incorrect.", code: "INVALID_CREDENTIALS" });
    return;
  }

  clearLoginFailures(request, email);
  const result = await updateDatabase(async (data) => {
    const user = data.users.find((item) => item.id === candidate.id && item.isActive !== false);
    if (!user) throw new HttpError(401, "Email ou mot de passe incorrect.", "INVALID_CREDENTIALS");
    const { token, session } = createSession(data, user, request);
    addAuditEntry(data, {
      actorId: user.id,
      action: "auth.login",
      targetType: "session",
      targetId: session.id,
    });
    return { token, expiresAt: session.expiresAt, user: sessionUser(data, user) };
  });

  sendJson(response, 200, result);
}

export async function logout(request, response) {
  await updateDatabase(async (data) => {
    revokeSession(data, request.auth.sessionId);
    addAuditEntry(data, {
      actorId: request.auth.userId,
      action: "auth.logout",
      targetType: "session",
      targetId: request.auth.sessionId,
    });
  });
  sendJson(response, 200, { ok: true });
}

export async function changePassword(request, response) {
  const body = await readRequestBody(request);
  rejectUnknownFields(body, ["currentPassword", "newPassword"]);
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const passwordError = validateNewPassword(newPassword);
  if (passwordError) throw new HttpError(400, passwordError, "WEAK_PASSWORD");
  if (currentPassword === newPassword) {
    throw new HttpError(400, "Le nouveau mot de passe doit être différent de l'ancien.", "PASSWORD_UNCHANGED");
  }

  const result = await updateDatabase(async (data) => {
    const user = data.users.find((item) => item.id === request.auth.userId && item.isActive !== false);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(400, "Le mot de passe actuel est incorrect.", "INVALID_CURRENT_PASSWORD");
    }

    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    user.passwordUpdatedAt = new Date().toISOString();
    revokeUserSessions(data, user.id, request.auth.sessionId);
    addAuditEntry(data, {
      actorId: user.id,
      action: "auth.password_changed",
      targetType: "user",
      targetId: user.id,
    });
    return { user: sessionUser(data, user) };
  });

  sendJson(response, 200, result);
}
