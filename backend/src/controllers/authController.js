import { readDatabase } from "../database/jsonDatabase.js";
import { roleKey } from "../utils/roles.js";
import { readRequestBody, sendJson } from "../utils/http.js";

export async function login(request, response) {
  const data = await readDatabase();
  const body = await readRequestBody(request);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = data.users.find((item) => item.email.toLowerCase() === email && item.isActive);

  if (!user || !password.trim()) {
    sendJson(response, 401, { error: "Email ou mot de passe incorrect." });
    return;
  }

  const department = data.departments.find((item) => item.id === user.departmentId);

  sendJson(response, 200, {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    roleKey: roleKey(user.role),
    departmentId: user.departmentId,
    departmentName: department?.name || "Operations",
  });
}
