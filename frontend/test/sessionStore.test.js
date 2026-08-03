import { describe, expect, it } from "vitest";
import { clearSession, loadSession, saveSession } from "../sessionStore.js";

function futureDate() {
  return new Date(Date.now() + 60000).toISOString();
}

describe("stockage de session", () => {
  it("enregistre et recharge une session valide", () => {
    const session = { token: "opaque", expiresAt: futureDate(), user: { id: "u1" } };
    saveSession(session);
    expect(loadSession()).toEqual(session);
  });

  it("supprime une session expirée et l'ancien stockage", () => {
    localStorage.setItem("richbond-session", JSON.stringify({ token: "old", expiresAt: "2020-01-01T00:00:00Z", user: { id: "u1" } }));
    localStorage.setItem("richbond-user", JSON.stringify({ id: "legacy" }));
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem("richbond-session")).toBeNull();
    expect(localStorage.getItem("richbond-user")).toBeNull();
  });

  it("nettoie explicitement les deux formats", () => {
    localStorage.setItem("richbond-session", "{}");
    localStorage.setItem("richbond-user", "{}");
    clearSession();
    expect(localStorage.length).toBe(0);
  });
});
