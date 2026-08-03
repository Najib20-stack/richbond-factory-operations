import { readDatabase, updateDatabase } from "../database/database.js";
import { createTask } from "../models/taskModel.js";
import { addAuditEntry } from "../utils/audit.js";
import { enrich } from "../utils/enrich.js";
import { HttpError, readRequestBody, sendJson } from "../utils/http.js";
import { isEmployee, isSupervisor } from "../utils/roles.js";
import { statusLabel } from "../utils/status.js";
import { canManageTask, canReviewTask, canViewTask, taskResponsibleIds } from "../utils/taskAccess.js";
import { enumValue, numberValue, rejectUnknownFields, stringArray, text } from "../utils/validation.js";

const TASK_STATUSES = ["Pending", "Ready", "In Progress", "On Hold", "Waiting for Review", "Completed", "Blocked", "Cancelled", "Rejected"];
const EMPLOYEE_TRANSITIONS = {
  Pending: ["In Progress", "Blocked"],
  Ready: ["In Progress", "Blocked"],
  "In Progress": ["Waiting for Review", "On Hold", "Blocked"],
  "On Hold": ["In Progress"],
  Blocked: ["In Progress"],
  Rejected: ["In Progress"],
  "Waiting for Review": [],
};

function addActivity(data, actorId, message) {
  data.activities.unshift({
    id: `a-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    message,
    time: "maintenant",
    actorId,
    createdAt: new Date().toISOString(),
  });
}

function addNotification(data, userId, message, taskId) {
  if (!userId) return;
  data.notifications.unshift({
    id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId,
    taskId,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

function addNote(task, actorId, message) {
  if (!message) return;
  task.notes = Array.isArray(task.notes) ? task.notes : [];
  task.notes.unshift({
    id: `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    message,
    createdBy: actorId,
    createdAt: new Date().toISOString(),
  });
}

function actorFrom(data, request) {
  const actor = data.users.find((user) => user.id === request.auth.userId && user.isActive !== false);
  if (!actor) throw new HttpError(401, "Session utilisateur invalide.", "AUTH_REQUIRED");
  return actor;
}

function assertDueDate(value) {
  const result = text(value, "La date d'échéance", { required: true, max: 32 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) {
    throw new HttpError(400, "La date d'échéance doit utiliser le format AAAA-MM-JJ.", "INVALID_DUE_DATE");
  }
  return result;
}

function validateResponsibleUsers(data, responsibleIds) {
  const users = responsibleIds.map((id) => data.users.find((user) => user.id === id));
  if (users.some((user) => !user || user.isActive === false || !isEmployee(user))) {
    throw new HttpError(400, "Chaque responsable doit être un employé actif.", "INVALID_RESPONSIBLE");
  }
  return users;
}

function validateTaskInput(body) {
  rejectUnknownFields(body, [
    "title", "description", "taskType", "consolidationType", "productType", "batchNumber", "quantity",
    "productionLine", "departmentId", "responsibleIds", "assignedEmployeeId", "verifierId", "supervisorId",
    "priority", "estimatedDuration", "dueDateLabel", "dueDate", "clientRequestId", "createdBy", "status",
  ]);
  const responsibleIds = stringArray(
    Array.isArray(body.responsibleIds) && body.responsibleIds.length
      ? body.responsibleIds
      : [body.assignedEmployeeId].filter(Boolean),
    "Le responsable",
    { required: true },
  );
  const taskType = enumValue(body.taskType || "normal", "Le type de tâche", ["normal", "consolidation"]);
  return {
    title: text(body.title, "Le titre de la tâche", { required: true, min: 3, max: 160 }),
    description: text(body.description, "La description", { max: 3000 }),
    taskType,
    consolidationType: taskType === "consolidation"
      ? enumValue(body.consolidationType || "normal_send", "Le sous-type", ["normal_send", "urgent_meeting"])
      : "",
    productType: text(body.productType, "Le produit", { max: 120 }),
    batchNumber: text(body.batchNumber, "Le lot", { max: 120 }),
    quantity: numberValue(body.quantity, "La quantité", { min: 1, max: 1000000, fallback: 1 }),
    productionLine: text(body.productionLine, "La ligne", { max: 120 }),
    departmentId: text(body.departmentId, "Le département", { required: true, max: 80 }),
    responsibleIds,
    verifierId: text(body.verifierId || body.supervisorId, "Le vérificateur", { required: true, max: 80 }),
    priority: enumValue(body.priority || "", "La priorité", ["", "Low", "Medium", "High", "Critical"]),
    estimatedDuration: text(body.estimatedDuration || "1h", "La durée estimée", { required: true, max: 80 }),
    dueDateLabel: assertDueDate(body.dueDateLabel || body.dueDate),
    clientRequestId: text(body.clientRequestId, "L'identifiant de requête", { max: 100 }),
  };
}

export async function listTasks(request, response) {
  const data = await readDatabase();
  const actor = actorFrom(data, request);
  const tasks = enrich(data).tasks.filter((task) => canViewTask(actor, task));
  sendJson(response, 200, tasks);
}

export async function createTaskRecord(request, response) {
  const body = await readRequestBody(request);
  const input = validateTaskInput(body);

  const result = await updateDatabase(async (data) => {
    const actor = actorFrom(data, request);
    if (!isSupervisor(actor)) throw new HttpError(403, "Seul un vérificateur peut créer une tâche.", "FORBIDDEN");

    if (input.clientRequestId) {
      const existing = data.tasks.find(
        (task) => task.createdBy === actor.id && task.clientRequestId === input.clientRequestId,
      );
      if (existing) return { task: enrich({ ...data, tasks: [existing] }).tasks[0], replayed: true };
    }

    if (!data.departments.some((department) => department.id === input.departmentId)) {
      throw new HttpError(400, "Le département sélectionné n'existe pas.", "INVALID_DEPARTMENT");
    }
    const verifier = data.users.find((user) => user.id === input.verifierId && user.isActive !== false);
    if (!verifier || !isSupervisor(verifier)) {
      throw new HttpError(400, "Le vérificateur doit être un superviseur actif.", "INVALID_VERIFIER");
    }
    validateResponsibleUsers(data, input.responsibleIds);

    const task = createTask({ ...input, createdBy: actor.id });
    data.tasks.unshift(task);
    addActivity(data, actor.id, `Nouvelle tâche créée : ${task.title}`);
    task.responsibleIds.forEach((userId) => addNotification(data, userId, `Nouvelle tâche affectée : ${task.title}`, task.id));
    addNotification(data, task.verifierId, `Vous êtes vérificateur de la tâche : ${task.title}`, task.id);
    addAuditEntry(data, {
      actorId: actor.id,
      action: "task.created",
      targetType: "task",
      targetId: task.id,
      details: { responsibleIds: task.responsibleIds, verifierId: task.verifierId },
    });
    return { task: enrich({ ...data, tasks: [task] }).tasks[0], replayed: false };
  });

  sendJson(response, result.replayed ? 200 : 201, result.task);
}

export async function updateTaskRecord(request, response, taskId) {
  const body = await readRequestBody(request);
  const allAllowedFields = [
    "status", "note", "dueDateChangeRequest", "dueDateLabel", "responsibleIds", "assignedEmployeeId",
    "verifierId", "title", "description", "priority", "estimatedDuration",
  ];
  rejectUnknownFields(body, allAllowedFields);
  if (!Object.keys(body).length) throw new HttpError(400, "Aucune modification fournie.", "VALIDATION_ERROR");

  const updatedTask = await updateDatabase(async (data) => {
    const actor = actorFrom(data, request);
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) throw new HttpError(404, "Tâche introuvable.", "TASK_NOT_FOUND");
    if (!canViewTask(actor, task)) throw new HttpError(403, "Vous n'avez pas accès à cette tâche.", "FORBIDDEN");

    const previousStatus = task.status;
    const previousDueDate = task.dueDateLabel;
    const note = Object.hasOwn(body, "note") ? text(body.note, "La note", { max: 2000 }) : "";

    if (isEmployee(actor)) {
      rejectUnknownFields(body, ["status", "note", "dueDateChangeRequest"]);
      if (!taskResponsibleIds(task).includes(actor.id)) {
        throw new HttpError(403, "Cette tâche n'est pas affectée à ce responsable.", "FORBIDDEN");
      }

      if (Object.hasOwn(body, "status")) {
        const nextStatus = enumValue(body.status, "Le statut", TASK_STATUSES);
        if (nextStatus !== previousStatus && !(EMPLOYEE_TRANSITIONS[previousStatus] || []).includes(nextStatus)) {
          throw new HttpError(409, `Transition interdite : ${statusLabel(previousStatus)} vers ${statusLabel(nextStatus)}.`, "INVALID_TRANSITION");
        }
        task.status = nextStatus;
      }
      if (Object.hasOwn(body, "dueDateChangeRequest")) {
        const requestText = text(body.dueDateChangeRequest, "La demande de date", { required: true, max: 1000 });
        task.dueDateChangeRequest = requestText;
        addNotification(data, task.createdBy, `${task.id} : demande de changement de date`, task.id);
      }
    } else {
      if (!canManageTask(actor, task)) throw new HttpError(403, "Vous ne pouvez pas modifier cette tâche.", "FORBIDDEN");

      if (Object.hasOwn(body, "status")) {
        const nextStatus = enumValue(body.status, "Le statut", TASK_STATUSES);
        if (!canReviewTask(actor, task)) {
          throw new HttpError(403, "Seul le vérificateur désigné peut valider cette tâche.", "FORBIDDEN");
        }
        if (previousStatus !== "Waiting for Review" || !["Completed", "In Progress"].includes(nextStatus)) {
          throw new HttpError(409, "Cette décision n'est pas autorisée pour le statut actuel.", "INVALID_TRANSITION");
        }
        task.status = nextStatus;
      }

      if (Object.hasOwn(body, "dueDateLabel")) task.dueDateLabel = assertDueDate(body.dueDateLabel);
      if (Object.hasOwn(body, "dueDateChangeRequest")) {
        task.dueDateChangeRequest = text(body.dueDateChangeRequest, "La demande de date", { max: 1000 });
      }
      if (Object.hasOwn(body, "responsibleIds") || Object.hasOwn(body, "assignedEmployeeId")) {
        const ids = stringArray(
          Object.hasOwn(body, "responsibleIds") ? body.responsibleIds : [body.assignedEmployeeId],
          "Le responsable",
          { required: true },
        );
        validateResponsibleUsers(data, ids);
        task.responsibleIds = ids;
        task.assignedEmployeeId = ids[0];
      }
      if (Object.hasOwn(body, "verifierId")) {
        const verifierId = text(body.verifierId, "Le vérificateur", { required: true, max: 80 });
        const verifier = data.users.find((user) => user.id === verifierId && user.isActive !== false);
        if (!verifier || !isSupervisor(verifier)) throw new HttpError(400, "Le vérificateur n'est pas valide.", "INVALID_VERIFIER");
        task.verifierId = verifierId;
        task.supervisorId = verifierId;
      }
      if (Object.hasOwn(body, "title")) task.title = text(body.title, "Le titre", { required: true, min: 3, max: 160 });
      if (Object.hasOwn(body, "description")) task.description = text(body.description, "La description", { max: 3000 });
      if (Object.hasOwn(body, "priority")) task.priority = enumValue(body.priority, "La priorité", ["", "Low", "Medium", "High", "Critical"]);
      if (Object.hasOwn(body, "estimatedDuration")) task.estimatedDuration = text(body.estimatedDuration, "La durée", { required: true, max: 80 });
    }

    addNote(task, actor.id, note);
    if (task.status === "In Progress" && !task.startedAt) task.startedAt = new Date().toISOString();
    if (task.status === "Waiting for Review" && previousStatus !== task.status) task.completedAt = new Date().toISOString();
    if (task.status === "Completed" && previousStatus !== task.status) task.approvedAt = new Date().toISOString();
    if (task.status === "In Progress" && previousStatus === "Waiting for Review") {
      task.refusalCount = Number(task.refusalCount || 0) + 1;
    }

    if (task.dueDateLabel !== previousDueDate) {
      taskResponsibleIds(task).forEach((userId) => addNotification(data, userId, `${task.id} : échéance modifiée`, task.id));
    }
    if (task.status === "Waiting for Review" && previousStatus !== task.status) {
      addNotification(data, task.verifierId || task.supervisorId, `${task.id} attend votre vérification`, task.id);
    }
    if (task.status === "Completed" && previousStatus !== task.status) {
      taskResponsibleIds(task).forEach((userId) => addNotification(data, userId, `${task.id} a été validée`, task.id));
    }
    if (task.status === "In Progress" && previousStatus === "Waiting for Review") {
      taskResponsibleIds(task).forEach((userId) => addNotification(data, userId, `${task.id} a été refusée et revient en cours`, task.id));
    }

    const activityMessage = note
      ? `${task.id} : nouvelle note ajoutée`
      : task.status !== previousStatus
        ? `${task.id} est passée à l'état ${statusLabel(task.status)}`
        : `${task.id} a été mise à jour`;
    addActivity(data, actor.id, activityMessage);
    addAuditEntry(data, {
      actorId: actor.id,
      action: "task.updated",
      targetType: "task",
      targetId: task.id,
      details: { fields: Object.keys(body), previousStatus, status: task.status },
    });

    return enrich({ ...data, tasks: [task] }).tasks[0];
  });

  sendJson(response, 200, updatedTask);
}

export async function deleteTaskRecord(request, response, taskId) {
  await updateDatabase(async (data) => {
    const actor = actorFrom(data, request);
    const taskIndex = data.tasks.findIndex((item) => item.id === taskId);
    if (taskIndex === -1) throw new HttpError(404, "Tâche introuvable.", "TASK_NOT_FOUND");
    const task = data.tasks[taskIndex];
    if (!canManageTask(actor, task)) throw new HttpError(403, "Vous ne pouvez pas supprimer cette tâche.", "FORBIDDEN");

    data.tasks.splice(taskIndex, 1);
    addActivity(data, actor.id, `Tâche supprimée : ${task.title}`);
    addAuditEntry(data, {
      actorId: actor.id,
      action: "task.deleted",
      targetType: "task",
      targetId: task.id,
    });
  });
  sendJson(response, 200, { ok: true });
}
