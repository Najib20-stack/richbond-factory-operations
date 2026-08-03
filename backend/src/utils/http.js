import { MAX_REQUEST_BODY_BYTES } from "../config/env.js";

export class HttpError extends Error {
  constructor(status, message, code = "REQUEST_ERROR", details = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

export function sendText(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

export async function readRequestBody(request) {
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new HttpError(413, "La requête est trop volumineuse.", "PAYLOAD_TOO_LARGE");
  }

  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BODY_BYTES) {
      throw new HttpError(413, "La requête est trop volumineuse.", "PAYLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }

  if (!chunks.length) return {};

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "Le corps de la requête doit être un objet JSON.", "INVALID_BODY");
    }
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Le corps JSON de la requête est invalide.", "INVALID_JSON");
  }
}
