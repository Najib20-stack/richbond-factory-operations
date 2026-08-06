const ENV = import.meta.env || {};
const ANDROID_EMULATOR_API_URL = ENV.MODE === "android" ? "http://10.0.2.2:3000" : "";
export const API_BASE_URL = String(ENV.VITE_API_URL || ANDROID_EMULATOR_API_URL).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, { status = 0, code = "REQUEST_ERROR", details, retryAfter = 0 } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function defaultOnlineCheck() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function createApiClient({
  baseUrl = API_BASE_URL,
  fetchImpl = (...args) => globalThis.fetch(...args),
  onlineCheck = defaultOnlineCheck,
  timeoutMs = 12000,
  retryDelay = delay,
} = {}) {
  async function request(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const {
      token,
      headers: customHeaders,
      timeoutMs: requestTimeoutMs = timeoutMs,
      ...fetchOptions
    } = options;
    const maxAttempts = method === "GET" ? 2 : 1;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (!onlineCheck()) {
        throw new ApiError("Aucune connexion réseau. Reconnectez-vous puis réessayez.", { code: "OFFLINE" });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      const headers = {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(customHeaders || {}),
      };

      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          ...fetchOptions,
          headers,
          signal: controller.signal,
        });
        const contentType = String(response.headers?.get?.("content-type") || "");
        const payload = contentType.includes("application/json")
          ? await response.json()
          : await response.text();

        if (!response.ok) {
          const error = new ApiError(
            typeof payload === "object" && payload?.error ? payload.error : String(payload || `Erreur ${response.status}`),
            {
              status: response.status,
              code: typeof payload === "object" && payload?.code ? payload.code : "HTTP_ERROR",
              details: typeof payload === "object" ? payload?.details : undefined,
              retryAfter: Number(response.headers?.get?.("retry-after") || 0),
            },
          );
          if (response.status >= 500 && attempt < maxAttempts) {
            lastError = error;
            await retryDelay(250);
            continue;
          }
          throw error;
        }

        return response.status === 204 ? null : payload;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        lastError = error?.name === "AbortError"
          ? new ApiError("Le serveur met trop de temps à répondre.", { code: "TIMEOUT" })
          : new ApiError("Impossible de joindre le serveur Richbond.", { code: "NETWORK_ERROR" });
        if (attempt < maxAttempts) {
          await retryDelay(250);
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new ApiError("La requête a échoué.");
  }

  return { request };
}
