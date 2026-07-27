import { readDatabase, writeDatabase } from "../database/jsonDatabase.js";
import { createDepartment } from "../models/departmentModel.js";
import { readRequestBody, sendJson } from "../utils/http.js";

export async function listDepartments(_request, response) {
  const data = await readDatabase();
  sendJson(response, 200, data.departments);
}

export async function createDepartmentRecord(request, response) {
  const data = await readDatabase();
  const body = await readRequestBody(request);

  if (!String(body.name || "").trim()) {
    sendJson(response, 400, { error: "Le nom du département est obligatoire." });
    return;
  }

  const alreadyExists = data.departments.some(
    (department) => department.name.toLowerCase() === String(body.name).trim().toLowerCase(),
  );

  if (alreadyExists) {
    sendJson(response, 409, { error: "Ce département existe déjà." });
    return;
  }

  const department = createDepartment(body, data.departments);
  data.departments.push(department);
  data.activities.unshift({
    id: `a-${Date.now()}`,
    message: `Nouveau département ajouté : ${department.name}`,
    time: "maintenant",
  });

  await writeDatabase(data);
  sendJson(response, 201, department);
}
