import { readDatabase, writeDatabase } from "../database/jsonDatabase.js";
import { createTask } from "../models/taskModel.js";
import { enrich } from "../utils/enrich.js";
import { readRequestBody, sendJson } from "../utils/http.js";
import { statusLabel } from "../utils/status.js";

function addActivity(data, message) {
  data.activities = Array.isArray(data.activities) ? data.activities : [];
  data.activities.unshift({
    id: `a-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    message,
    time: "maintenant",
  });
}

function addNotification(data, userId, message, taskId) {
  if (!userId) return;
  data.notifications = Array.isArray(data.notifications) ? data.notifications : [];
  data.notifications.unshift({
    id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId,
    taskId,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

export async function listTasks(_request, response) {
  const data = await readDatabase();
  sendJson(response, 200, enrich(data).tasks);
}

export async function createTaskRecord(request, response) {
  const data = await readDatabase();
  const body = await readRequestBody(request);

  if (!body.title) {
    sendJson(response, 400, { error: "Le titre de la tâche est obligatoire." });
    return;
  }

  const creator = data.users.find((user) => user.id === body.createdBy);
  const verifier = data.users.find((user) => user.id === (body.verifierId || body.supervisorId));
  const responsibleIds = Array.isArray(body.responsibleIds) && body.responsibleIds.length
    ? body.responsibleIds
    : [body.assignedEmployeeId].filter(Boolean);
  const responsibleUsers = responsibleIds.map((id) => data.users.find((user) => user.id === id)).filter(Boolean);

  if (!creator || !String(creator.role || "").toLowerCase().includes("super")) {
    sendJson(response, 403, { error: "Seul un vérificateur peut créer et affecter une tâche." });
    return;
  }

  if (!verifier || !String(verifier.role || "").toLowerCase().includes("super")) {
    sendJson(response, 400, { error: "Le vérificateur doit être un superviseur." });
    return;
  }

  if (!responsibleUsers.length || responsibleUsers.some((user) => String(user.role || "").toLowerCase().includes("super"))) {
    sendJson(response, 400, { error: "Le responsable doit être un employé." });
    return;
  }

  const task = createTask(body);
  data.tasks.unshift(task);
  addActivity(data, `Nouvelle tâche créée : ${task.title}`);
  task.responsibleIds.forEach((userId) => addNotification(data, userId, `Nouvelle tâche affectée : ${task.title}`, task.id));
  addNotification(data, task.verifierId, `Vous êtes vérificateur de la tâche : ${task.title}`, task.id);

  await writeDatabase(data);
  sendJson(response, 201, enrich({ ...data, tasks: [task] }).tasks[0]);
}

export async function updateTaskRecord(request, response, taskId) {
  const data = await readDatabase();
  const body = await readRequestBody(request);
  const task = data.tasks.find((item) => item.id === taskId);

  if (!task) {
    sendJson(response, 404, { error: "Tâche introuvable." });
    return;
  }

  const note = String(body.note || "").trim();
  const previousStatus = task.status;
  const previousDueDate = task.dueDateLabel;
  delete body.note;
  Object.assign(task, body);

  if (note) {
    task.notes = Array.isArray(task.notes) ? task.notes : [];
    task.notes.unshift({
      id: `n-${Date.now()}`,
      message: note,
      createdAt: new Date().toISOString(),
    });
  }

  if (body.responsibleIds && Array.isArray(body.responsibleIds)) task.assignedEmployeeId = body.responsibleIds[0] || task.assignedEmployeeId;
  if (body.verifierId) task.supervisorId = body.verifierId;
  if (body.status === "In Progress" && !task.startedAt) task.startedAt = new Date().toISOString();
  if (body.status === "Waiting for Review") task.completedAt = new Date().toISOString();
  if (body.status === "Completed") task.approvedAt = new Date().toISOString();
  if (body.status === "In Progress" && previousStatus === "Waiting for Review") {
    task.refusalCount = Number(task.refusalCount || 0) + 1;
  }

  if (body.dueDateChangeRequest) {
    addNotification(data, task.createdBy, `${task.id} : demande de changement de date`, task.id);
  }
  if (body.dueDateLabel && body.dueDateLabel !== previousDueDate) {
    (task.responsibleIds || [task.assignedEmployeeId]).forEach((userId) => addNotification(data, userId, `${task.id} : échéance modifiée`, task.id));
  }
  if (body.status === "Waiting for Review") addNotification(data, task.verifierId || task.supervisorId, `${task.id} attend votre vérification`, task.id);
  if (body.status === "Completed") (task.responsibleIds || [task.assignedEmployeeId]).forEach((userId) => addNotification(data, userId, `${task.id} a été validée`, task.id));
  if (body.status === "In Progress" && previousStatus === "Waiting for Review") (task.responsibleIds || [task.assignedEmployeeId]).forEach((userId) => addNotification(data, userId, `${task.id} a été refusée et revient en cours`, task.id));

  addActivity(data, note ? `${task.id} : nouvelle note ajoutée` : `${task.id} est passée à l'état ${statusLabel(task.status)}`);

  await writeDatabase(data);
  sendJson(response, 200, enrich({ ...data, tasks: [task] }).tasks[0]);
}

export async function deleteTaskRecord(_request, response, taskId) {
  const data = await readDatabase();
  const taskIndex = data.tasks.findIndex((item) => item.id === taskId);

  if (taskIndex === -1) {
    sendJson(response, 404, { error: "Tâche introuvable." });
    return;
  }

  const [task] = data.tasks.splice(taskIndex, 1);
  addActivity(data, `Tâche supprimée : ${task.title}`);
  await writeDatabase(data);
  sendJson(response, 200, { ok: true });
}
