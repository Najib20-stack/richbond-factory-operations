import { readFile } from "node:fs/promises";
import path from "node:path";
import { FRONTEND_DIR } from "../config/env.js";
import { sendText } from "../utils/http.js";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
};

export function staticCacheControl(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  // The HTML shell points to hashed bundles and must always be revalidated so
  // installed mobile browsers cannot keep an obsolete interface indefinitely.
  if (extension === ".html") return "no-store";

  const relativePath = path.relative(FRONTEND_DIR, filePath);
  const isBundledAsset = relativePath.split(path.sep)[0] === "assets";
  const hasContentHash = /-[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9]+$/.test(path.basename(filePath));

  if (isBundledAsset && hasContentHash) {
    return "public, max-age=31536000, immutable";
  }

  return "no-cache";
}

function staticHeaders(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    "Cache-Control": staticCacheControl(filePath),
    "Content-Type": contentTypes[extension] || "application/octet-stream",
  };
}

function resolvePublicFile(pathname) {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const absolutePath = path.resolve(FRONTEND_DIR, relativePath);
  const rootWithSeparator = `${path.resolve(FRONTEND_DIR)}${path.sep}`;

  if (absolutePath !== path.resolve(FRONTEND_DIR) && !absolutePath.startsWith(rootWithSeparator)) {
    return null;
  }

  return absolutePath;
}

export async function serveStatic(response, pathname) {
  const requestedFile = resolvePublicFile(pathname);

  if (!requestedFile) {
    sendText(response, 404, "Introuvable");
    return;
  }

  try {
    const content = await readFile(requestedFile);
    response.writeHead(200, staticHeaders(requestedFile));
    response.end(content);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;

    try {
      const fallbackFile = path.join(FRONTEND_DIR, "index.html");
      const fallback = await readFile(fallbackFile);
      response.writeHead(200, staticHeaders(fallbackFile));
      response.end(fallback);
    } catch {
      sendText(response, 503, "Interface non compilée. Exécutez npm run build.");
    }
  }
}
