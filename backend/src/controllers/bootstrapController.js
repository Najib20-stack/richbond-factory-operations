import { readDatabase } from "../database/jsonDatabase.js";
import { enrich } from "../utils/enrich.js";
import { sendJson } from "../utils/http.js";

export async function getBootstrap(_request, response) {
  const data = await readDatabase();
  sendJson(response, 200, enrich(data));
}

export function getHealth(_request, response) {
  sendJson(response, 200, { ok: true, app: "Richbond Operations Usine" });
}
