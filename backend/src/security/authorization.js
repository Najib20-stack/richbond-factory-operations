import { findAuthentication } from "../database/database.js";
import { sendJson } from "../utils/http.js";
import { roleKey } from "../utils/roles.js";
import { hashSessionToken } from "./sessions.js";

function bearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function authenticateRequest(request, response, { allowPasswordChange = false } = {}) {
  const token = bearerToken(request);
  const authentication = token ? await findAuthentication(hashSessionToken(token)) : null;
  const session = authentication?.session;
  const user = authentication?.user;

  if (!session || !user) {
    sendJson(response, 401, { error: "Session absente, expirée ou révoquée.", code: "AUTH_REQUIRED" });
    return false;
  }

  if (user.mustChangePassword && !allowPasswordChange) {
    sendJson(response, 403, { error: "Le mot de passe temporaire doit être remplacé.", code: "PASSWORD_CHANGE_REQUIRED" });
    return false;
  }

  request.auth = {
    userId: user.id,
    sessionId: session.id,
    role: roleKey(user.role),
    user,
  };
  return true;
}

export function requireCombinedRole(request, response) {
  if (request.auth?.role === "combined") return true;
  sendJson(response, 403, { error: "Cette action est réservée aux comptes Vérificateur/Responsable.", code: "FORBIDDEN" });
  return false;
}

export function requireOperationsRole(request, response) {
  if (["admin", "combined"].includes(request.auth?.role)) return true;
  sendJson(response, 403, { error: "Ce compte ne peut pas gérer les opérations.", code: "FORBIDDEN" });
  return false;
}

export function requireAdministrator(request, response) {
  if (request.auth?.role === "admin") return true;
  sendJson(response, 403, { error: "Cette action est réservée aux administrateurs.", code: "FORBIDDEN" });
  return false;
}
