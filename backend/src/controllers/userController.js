import { readDatabase, updateDatabase } from "../database/database.js";
import { createUser } from "../models/userModel.js";
import { hashPassword, validateNewPassword } from "../security/passwords.js";
import { revokeUserSessions } from "../security/sessions.js";
import { addAuditEntry } from "../utils/audit.js";
import { enrich } from "../utils/enrich.js";
import { HttpError, readRequestBody, sendJson } from "../utils/http.js";
import { ADMIN_ROLE, COMBINED_ROLE, roleKey } from "../utils/roles.js";
import { email, numberValue, rejectUnknownFields, text } from "../utils/validation.js";

function canonicalRole(value) {
  const key = roleKey(value);
  if (key === "admin") return ADMIN_ROLE;
  if (key === "combined") return COMBINED_ROLE;
  throw new HttpError(400, "Le rôle n'est pas valide.", "VALIDATION_ERROR");
}

function publicUser(data, user) {
  return enrich({ ...data, users: [user] }).users[0];
}

export async function listUsers(_request, response) {
  const data = await readDatabase();
  sendJson(response, 200, enrich(data).users);
}

export async function createUserRecord(request, response) {
  const body = await readRequestBody(request);
  rejectUnknownFields(body, ["firstName", "lastName", "email", "phone", "role", "departmentId", "load", "temporaryPassword", "password"]);
  const temporaryPassword = String(body.temporaryPassword || body.password || "");
  const passwordError = validateNewPassword(temporaryPassword);
  if (passwordError) throw new HttpError(400, passwordError, "WEAK_PASSWORD");

  const input = {
    firstName: text(body.firstName, "Le prénom", { required: true, min: 2, max: 80 }),
    lastName: text(body.lastName, "Le nom", { required: true, min: 2, max: 80 }),
    email: email(body.email),
    phone: text(body.phone, "Le téléphone", { max: 40 }),
    role: canonicalRole(body.role),
    departmentId: text(body.departmentId, "Le département", { required: true, max: 80 }),
    load: numberValue(body.load, "La charge", { min: 0, max: 100, fallback: 0 }),
    passwordHash: await hashPassword(temporaryPassword),
  };

  const user = await updateDatabase(async (data) => {
    if (!data.departments.some((department) => department.id === input.departmentId)) {
      throw new HttpError(400, "Le département sélectionné n'existe pas.", "INVALID_DEPARTMENT");
    }
    if (data.users.some((item) => item.email.toLowerCase() === input.email)) {
      throw new HttpError(409, "Cet email existe déjà.", "USER_EXISTS");
    }

    const created = createUser(input);
    data.users.push(created);
    data.activities.unshift({
      id: `a-${Date.now()}`,
      message: `Nouvel utilisateur créé : ${created.firstName} ${created.lastName}`,
      time: "maintenant",
      actorId: request.auth.userId,
      createdAt: new Date().toISOString(),
    });
    addAuditEntry(data, {
      actorId: request.auth.userId,
      action: "user.created",
      targetType: "user",
      targetId: created.id,
      details: { role: created.role, departmentId: created.departmentId },
    });
    return publicUser(data, created);
  });

  sendJson(response, 201, user);
}

export async function updateUserRecord(request, response, userId) {
  const body = await readRequestBody(request);
  rejectUnknownFields(body, ["firstName", "lastName", "email", "phone", "role", "departmentId", "isActive", "load", "temporaryPassword"]);
  if (!Object.keys(body).length) throw new HttpError(400, "Aucune modification fournie.", "VALIDATION_ERROR");

  const updatedUser = await updateDatabase(async (data) => {
    const user = data.users.find((item) => item.id === userId);
    if (!user) throw new HttpError(404, "Utilisateur introuvable.", "USER_NOT_FOUND");

    if (Object.hasOwn(body, "firstName")) user.firstName = text(body.firstName, "Le prénom", { required: true, min: 2, max: 80 });
    if (Object.hasOwn(body, "lastName")) user.lastName = text(body.lastName, "Le nom", { required: true, min: 2, max: 80 });
    if (Object.hasOwn(body, "phone")) user.phone = text(body.phone, "Le téléphone", { max: 40 });
    if (Object.hasOwn(body, "load")) user.load = numberValue(body.load, "La charge", { min: 0, max: 100 });

    if (Object.hasOwn(body, "email")) {
      const nextEmail = email(body.email);
      if (data.users.some((item) => item.id !== user.id && item.email.toLowerCase() === nextEmail)) {
        throw new HttpError(409, "Cet email existe déjà.", "USER_EXISTS");
      }
      user.email = nextEmail;
    }

    if (Object.hasOwn(body, "departmentId")) {
      const departmentId = text(body.departmentId, "Le département", { required: true, max: 80 });
      if (!data.departments.some((department) => department.id === departmentId)) {
        throw new HttpError(400, "Le département sélectionné n'existe pas.", "INVALID_DEPARTMENT");
      }
      user.departmentId = departmentId;
    }

    if (Object.hasOwn(body, "role")) {
      const nextRole = canonicalRole(body.role);
      if (user.id === request.auth.userId && nextRole !== ADMIN_ROLE) {
        throw new HttpError(400, "Vous ne pouvez pas retirer votre propre rôle d'administrateur.", "SELF_ROLE_CHANGE");
      }
      user.role = nextRole;
    }

    if (Object.hasOwn(body, "isActive")) {
      if (typeof body.isActive !== "boolean") throw new HttpError(400, "L'état du compte n'est pas valide.", "VALIDATION_ERROR");
      if (user.id === request.auth.userId && !body.isActive) {
        throw new HttpError(400, "Vous ne pouvez pas désactiver votre propre compte.", "SELF_DEACTIVATION");
      }
      user.isActive = body.isActive;
      if (!user.isActive) revokeUserSessions(data, user.id);
    }

    if (Object.hasOwn(body, "temporaryPassword")) {
      const temporaryPassword = String(body.temporaryPassword || "");
      const passwordError = validateNewPassword(temporaryPassword);
      if (passwordError) throw new HttpError(400, passwordError, "WEAK_PASSWORD");
      user.passwordHash = await hashPassword(temporaryPassword);
      user.mustChangePassword = true;
      user.passwordUpdatedAt = null;
      revokeUserSessions(data, user.id);
    }

    addAuditEntry(data, {
      actorId: request.auth.userId,
      action: "user.updated",
      targetType: "user",
      targetId: user.id,
      details: { fields: Object.keys(body) },
    });
    return publicUser(data, user);
  });

  sendJson(response, 200, updatedUser);
}
