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
    const extension = path.extname(requestedFile);
    response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
    response.end(content);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;

    try {
      const fallback = await readFile(path.join(FRONTEND_DIR, "index.html"));
      response.writeHead(200, { "Content-Type": contentTypes[".html"] });
      response.end(fallback);
    } catch {
      sendText(response, 503, "Interface non compilée. Exécutez npm run build.");
    }
  }
}
