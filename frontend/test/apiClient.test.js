import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "../apiClient.js";

function jsonResponse(status, payload, extraHeaders = {}) {
  const headers = new Map(Object.entries({ "content-type": "application/json", ...extraHeaders }).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers.get(String(name).toLowerCase()) || null },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe("client API", () => {
  it("envoie le jeton de session et lit la réponse JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = createApiClient({ baseUrl: "http://api.test", fetchImpl });

    await expect(client.request("/api/bootstrap", { token: "secret-token" })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api.test/api/bootstrap");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer secret-token");
    expect(fetchImpl.mock.calls[0][1]).not.toHaveProperty("token");
  });

  it("conserve le code et le délai d'une erreur structurée", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, { error: "Trop de tentatives.", code: "LOGIN_RATE_LIMITED" }, { "retry-after": "45" }));
    const client = createApiClient({ fetchImpl });

    await expect(client.request("/api/login", { method: "POST", body: "{}" })).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
      code: "LOGIN_RATE_LIMITED",
      retryAfter: 45,
    });
  });

  it("réessaie une lecture après une erreur serveur", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: "Indisponible" }))
      .mockResolvedValueOnce(jsonResponse(200, { tasks: [] }));
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = createApiClient({ fetchImpl, retryDelay });

    await expect(client.request("/api/tasks")).resolves.toEqual({ tasks: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(retryDelay).toHaveBeenCalledOnce();
  });

  it("arrête immédiatement une requête hors connexion", async () => {
    const fetchImpl = vi.fn();
    const client = createApiClient({ fetchImpl, onlineCheck: () => false });

    await expect(client.request("/api/bootstrap")).rejects.toEqual(expect.objectContaining({ code: "OFFLINE" }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ne réessaie jamais automatiquement une écriture", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    const client = createApiClient({ fetchImpl, retryDelay: vi.fn() });

    await expect(client.request("/api/tasks", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("accepte un delai specifique pour une requete lente", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url, options) => new Promise((resolve, reject) => {
        const responseTimer = setTimeout(() => resolve(jsonResponse(200, { ok: true })), 20);
        options.signal.addEventListener("abort", () => {
          clearTimeout(responseTimer);
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }));
      const client = createApiClient({ fetchImpl, timeoutMs: 5 });
      const response = client.request("/api/login", { method: "POST", timeoutMs: 30 });

      await vi.advanceTimersByTimeAsync(20);
      await expect(response).resolves.toEqual({ ok: true });
      expect(fetchImpl.mock.calls[0][1]).not.toHaveProperty("timeoutMs");
    } finally {
      vi.useRealTimers();
    }
  });
});
