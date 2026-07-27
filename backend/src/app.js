import { createServer as createHttpServer } from "node:http";
import { handleApi } from "./routes/apiRoutes.js";
import { serveStatic } from "./services/staticFileService.js";
import { sendJson } from "./utils/http.js";

export function createServer() {
  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url);
        return;
      }

      await serveStatic(response, url.pathname);
    } catch (error) {
      console.error(error);
      sendJson(response, 500, { error: "Erreur interne du serveur." });
    }
  });
}
