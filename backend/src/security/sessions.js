import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SESSION_TTL_MS } from "../config/env.js";

export function hashSessionToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export function createSession(data, user, request) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const session = {
    id: randomUUID(),
    tokenHash: hashSessionToken(token),
    userId: user.id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    userAgent: String(request.headers["user-agent"] || "").slice(0, 300),
  };

  const activeSessions = (Array.isArray(data.sessions) ? data.sessions : [])
    .filter((item) => Date.parse(item.expiresAt) > now)
    .filter((item) => item.userId !== user.id)
    .concat(
      (Array.isArray(data.sessions) ? data.sessions : [])
        .filter((item) => item.userId === user.id && Date.parse(item.expiresAt) > now)
        .slice(-4),
    );
  data.sessions = [...activeSessions, session];

  return { token, session };
}

export function findSession(data, token) {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  return (data.sessions || []).find(
    (session) => session.tokenHash === tokenHash && Date.parse(session.expiresAt) > Date.now(),
  ) || null;
}

export function revokeSession(data, sessionId) {
  data.sessions = (data.sessions || []).filter((session) => session.id !== sessionId);
}

export function revokeUserSessions(data, userId, exceptSessionId = "") {
  data.sessions = (data.sessions || []).filter(
    (session) => session.userId !== userId || session.id === exceptSessionId,
  );
}
