import { httpServerHandler } from "cloudflare:node";
import { createServer } from "../backend/src/app.js";
import { ensureDatabase } from "../backend/src/database/database.js";

const nodeHandler = httpServerHandler(createServer());
let databaseReady;

function ensureWorkerDatabase() {
  if (!databaseReady) {
    databaseReady = ensureDatabase().catch((error) => {
      databaseReady = undefined;
      throw error;
    });
  }
  return databaseReady;
}

export default {
  async fetch(request, environment, context) {
    await ensureWorkerDatabase();
    return nodeHandler.fetch(request, environment, context);
  },
};
