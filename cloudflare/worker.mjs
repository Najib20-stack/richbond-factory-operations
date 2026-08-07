import { httpServerHandler } from "cloudflare:node";
import { createServer } from "../backend/src/app.js";
import { ensureDatabase } from "../backend/src/database/database.js";
import { withPostgresRequest } from "../backend/src/database/postgresPool.js";

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
    return withPostgresRequest(environment.DATABASE_URL, async () => {
      await ensureWorkerDatabase();
      return nodeHandler.fetch(request, environment, context);
    });
  },
};
