import { LOGIN_LOCK_MS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from "../config/env.js";

const attempts = new Map();

function keyFor(request, email) {
  const address = request.socket?.remoteAddress || "unknown";
  return `${address}|${String(email || "").toLowerCase()}`;
}

function currentEntry(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStartedAt > LOGIN_WINDOW_MS) {
    const fresh = { failures: 0, windowStartedAt: now, lockedUntil: 0 };
    attempts.set(key, fresh);
    return fresh;
  }
  return entry;
}

export function loginAvailability(request, email) {
  const entry = currentEntry(keyFor(request, email));
  const remainingMs = entry.lockedUntil - Date.now();
  return {
    allowed: remainingMs <= 0,
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
  };
}

export function recordLoginFailure(request, email) {
  const entry = currentEntry(keyFor(request, email));
  entry.failures += 1;
  if (entry.failures >= LOGIN_MAX_ATTEMPTS) entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
}

export function clearLoginFailures(request, email) {
  attempts.delete(keyFor(request, email));
}

export function resetLoginProtectionForTests() {
  attempts.clear();
}
