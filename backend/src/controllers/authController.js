import { randomBytes } from "node:crypto";
import {
  commitLogin,
  commitLogout,
  commitPasswordChange,
  findUserForLogin,
} from "../database/database.js";
import { clearLoginFailures, loginAvailability, recordLoginFailure } from "../security/loginProtection.js";
import { hashPassword, validateNewPassword, verifyPassword } from "../security/passwords.js";
import { createSession } from "../security/sessions.js";
import { createAuditEntry } from "../utils/audit.js";
import { HttpError, readRequestBody, sendJson } from "../utils/http.js";
import { roleKey } from "../utils/roles.js";
import { rejectUnknownFields, text } from "../utils/validation.js";

let dummyHashPromise;

function dummyPasswordHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(randomBytes(24).toString("base64url"));
  }
  return dummyHashPromise;
}

function sessionUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    roleKey: roleKey(user.role),
    departmentId: user.departmentId,
    departmentName: user.departmentName || "Operations",
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

  const candidate = await findUserForLogin(email);
  const passwordMatches = await verifyPassword(password, candidate?.passwordHash || await dummyPasswordHash());

  if (!candidate || !passwordMatches) {
    recordLoginFailure(request, email);
    sendJson(response, 401, { error: "Email ou mot de passe incorrect.", code: "INVALID_CREDENTIALS" });
    return;
  }

  clearLoginFailures(request, email);
  const { token, session } = createSession({ sessions: [] }, candidate, request);
  await commitLogin({
    session,
    auditEntry: createAuditEntry({
      actorId: candidate.id,
      action: "auth.login",
      targetType: "session",
      targetId: session.id,
    }),
  });

  sendJson(response, 200, {
    token,
    expiresAt: session.expiresAt,
    user: sessionUser(candidate),
  });
}

export async function logout(request, response) {
  await commitLogout({
    userId: request.auth.userId,
    sessionId: request.auth.sessionId,
    auditEntry: createAuditEntry({
      actorId: request.auth.userId,
      action: "auth.logout",
      targetType: "session",
      targetId: request.auth.sessionId,
    }),
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

  const user = request.auth.user;
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Le mot de passe actuel est incorrect.", "INVALID_CURRENT_PASSWORD");
  }

  const passwordHash = await hashPassword(newPassword);
  const passwordUpdatedAt = new Date().toISOString();
  await commitPasswordChange({
    userId: user.id,
    passwordHash,
    passwordUpdatedAt,
    exceptSessionId: request.auth.sessionId,
    auditEntry: createAuditEntry({
      actorId: user.id,
      action: "auth.password_changed",
      targetType: "user",
      targetId: user.id,
    }),
  });

  sendJson(response, 200, {
    user: sessionUser({
      ...user,
      passwordHash,
      mustChangePassword: false,
      passwordUpdatedAt,
    }),
  });
}
