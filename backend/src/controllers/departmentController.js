import { readDatabase, updateDatabase } from "../database/database.js";
import { createDepartment } from "../models/departmentModel.js";
import { addAuditEntry } from "../utils/audit.js";
import { HttpError, readRequestBody, sendJson } from "../utils/http.js";
import { numberValue, rejectUnknownFields, text } from "../utils/validation.js";

export async function listDepartments(_request, response) {
  const data = await readDatabase();
  sendJson(response, 200, data.departments);
}

export async function createDepartmentRecord(request, response) {
  const body = await readRequestBody(request);
  rejectUnknownFields(body, ["name", "description", "capacity"]);
  const input = {
    name: text(body.name, "Le nom du département", { required: true, min: 2, max: 80 }),
    description: text(body.description, "La description", { max: 500 }),
    capacity: numberValue(body.capacity, "La capacité", { min: 0, max: 100, fallback: 50 }),
  };

  const department = await updateDatabase(async (data) => {
    const alreadyExists = data.departments.some(
      (item) => item.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (alreadyExists) throw new HttpError(409, "Ce département existe déjà.", "DEPARTMENT_EXISTS");

    const created = createDepartment(input, data.departments);
    data.departments.push(created);
    data.activities.unshift({
      id: `a-${Date.now()}`,
      message: `Nouveau département ajouté : ${created.name}`,
      time: "maintenant",
      actorId: request.auth.userId,
      createdAt: new Date().toISOString(),
    });
    addAuditEntry(data, {
      actorId: request.auth.userId,
      action: "department.created",
      targetType: "department",
      targetId: created.id,
    });
    return created;
  });

  sendJson(response, 201, department);
}
