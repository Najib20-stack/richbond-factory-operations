const SESSION_KEY = "richbond-session";
const LEGACY_USER_KEY = "richbond-user";

export function loadSession(storage = globalThis.localStorage) {
  try {
    const session = JSON.parse(storage.getItem(SESSION_KEY) || "null");
    if (!session?.token || !session?.user || Date.parse(session.expiresAt) <= Date.now()) {
      storage.removeItem(SESSION_KEY);
      storage.removeItem(LEGACY_USER_KEY);
      return null;
    }
    storage.removeItem(LEGACY_USER_KEY);
    return session;
  } catch {
    storage.removeItem(SESSION_KEY);
    storage.removeItem(LEGACY_USER_KEY);
    return null;
  }
}

export function saveSession(session, storage = globalThis.localStorage) {
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  storage.removeItem(LEGACY_USER_KEY);
}

export function clearSession(storage = globalThis.localStorage) {
  storage.removeItem(SESSION_KEY);
  storage.removeItem(LEGACY_USER_KEY);
}
