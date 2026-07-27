import { readDatabase, writeDatabase } from "../database/jsonDatabase.js";
import { createUser } from "../models/userModel.js";
import { enrich } from "../utils/enrich.js";
import { readRequestBody, sendJson } from "../utils/http.js";

export async function listUsers(_request, response) {
  const data = await readDatabase();
  sendJson(response, 200, enrich(data).users);
}

export async function createUserRecord(request, response) {
  const data = await readDatabase();
  const body = await readRequestBody(request);

  if (!String(body.firstName || "").trim() || !String(body.lastName || "").trim() || !String(body.email || "").trim()) {
    sendJson(response, 400, { error: "Prénom, nom et email sont obligatoires." });
    return;
  }

  const alreadyExists = data.users.some((user) => user.email.toLowerCase() === String(body.email).trim().toLowerCase());
  if (alreadyExists) {
    sendJson(response, 409, { error: "Cet email existe déjà." });
    return;
  }

  const user = createUser(body, data.departments);
  data.users.push(user);
  data.activities.unshift({
    id: `a-${Date.now()}`,
    message: `Nouvel utilisateur créé : ${user.firstName} ${user.lastName}`,
    time: "maintenant",
  });

  await writeDatabase(data);
  sendJson(response, 201, enrich({ ...data, users: [user] }).users[0]);
}

export async function updateUserRecord(request, response, userId) {
  const data = await readDatabase();
  const body = await readRequestBody(request);
  const user = data.users.find((item) => item.id === userId);

  if (!user) {
    sendJson(response, 404, { error: "Utilisateur introuvable." });
    return;
  }

  Object.assign(user, body);
  await writeDatabase(data);
  sendJson(response, 200, enrich({ ...data, users: [user] }).users[0]);
}
