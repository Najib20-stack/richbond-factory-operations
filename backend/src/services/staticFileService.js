import { readFile } from "node:fs/promises";
import path from "node:path";
import { FRONTEND_DIR } from "../config/env.js";
import { sendText } from "../utils/http.js";

const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/assets/richbond-logo.svg", "assets/richbond-logo.svg"],
]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

export async function serveStatic(response, pathname) {
  const file = publicFiles.get(pathname);

  if (!file) {
    sendText(response, 404, "Introuvable");
    return;
  }

  const extension = path.extname(file);
  const content = await readFile(path.join(FRONTEND_DIR, file));

  response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
  response.end(content);
}
