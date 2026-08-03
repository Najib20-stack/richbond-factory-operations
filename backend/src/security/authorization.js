import { readDatabase } from "../database/database.js";
import { sendJson } from "../utils/http.js";
import { roleKey } from "../utils/roles.js";
import { findSession } from "./sessions.js";

function bearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function authenticateRequest(request, response, { allowPasswordChange = false } = {}) {
  const token = bearerToken(request);
  const data = await readDatabase();
  const session = findSession(data, token);
  const user = session ? data.users.find((item) => item.id === session.userId && item.isActive !== false) : null;

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
  };
  return true;
}

export function requireSupervisor(request, response) {
  if (request.auth?.role === "supervisor") return true;
  sendJson(response, 403, { error: "Cette action est réservée aux vérificateurs.", code: "FORBIDDEN" });
  return false;
}
