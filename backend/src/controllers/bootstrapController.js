import { checkDatabase, databaseEngine, readDatabase } from "../database/database.js";
import { enrich } from "../utils/enrich.js";
import { sendJson } from "../utils/http.js";
import { roleKey } from "../utils/roles.js";
import { canViewTask } from "../utils/taskAccess.js";

export async function getBootstrap(request, response) {
  const data = await readDatabase();
  const currentUser = data.users.find((user) => user.id === request.auth.userId);
  const safeData = enrich(data);
  const supervisor = roleKey(currentUser?.role) === "supervisor";

  safeData.tasks = safeData.tasks.filter((task) => canViewTask(currentUser, task));
  safeData.notifications = safeData.notifications.filter((item) => item.userId === currentUser.id);

  if (!supervisor) {
    safeData.users = safeData.users.filter((user) => user.id === currentUser.id);
    safeData.activities = [];
    safeData.reports = [];
  }

  sendJson(response, 200, safeData);
}

export async function getHealth(_request, response) {
  await checkDatabase();
  sendJson(response, 200, { ok: true, app: "Richbond Operations Usine", database: databaseEngine });
}
