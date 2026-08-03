import { createServer as createHttpServer } from "node:http";
import { CORS_ORIGINS } from "./config/env.js";
import { handleApi } from "./routes/apiRoutes.js";
import { serveStatic } from "./services/staticFileService.js";
import { HttpError, sendJson } from "./utils/http.js";

function isSameHostOrigin(origin, host) {
  if (!origin || !host) return false;
  try {
    return new URL(origin).hostname === new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
}

export function createServer() {
  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Frame-Options", "DENY");
      response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
      response.setHeader("X-Permitted-Cross-Domain-Policies", "none");

      if (url.pathname.startsWith("/api/")) {
        const requestOrigin = request.headers.origin;
        const allowAnyOrigin = CORS_ORIGINS.includes("*");
        const allowedOrigin = allowAnyOrigin
          || isSameHostOrigin(requestOrigin, request.headers.host)
          || (requestOrigin && CORS_ORIGINS.includes(requestOrigin))
          ? requestOrigin || "*"
          : "";

        if (requestOrigin && !allowedOrigin) {
          sendJson(response, 403, { error: "Origine non autorisée.", code: "ORIGIN_FORBIDDEN" });
          return;
        }

        if (allowedOrigin) {
          response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
          response.setHeader("Vary", "Origin");
        }
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
        response.setHeader("Access-Control-Expose-Headers", "Retry-After");

        if (request.method === "OPTIONS") {
          response.writeHead(204);
          response.end();
          return;
        }

        await handleApi(request, response, url);
        return;
      }

      await serveStatic(response, url.pathname);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, {
          error: error.message,
          code: error.code,
          ...(error.details ? { details: error.details } : {}),
        });
        return;
      }
      console.error(error);
      sendJson(response, 500, { error: "Erreur interne du serveur.", code: "INTERNAL_ERROR" });
    }
  });
}
