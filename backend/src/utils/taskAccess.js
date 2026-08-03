import { roleKey } from "./roles.js";

export function taskResponsibleIds(task) {
  return Array.isArray(task.responsibleIds) && task.responsibleIds.length
    ? task.responsibleIds
    : [task.assignedEmployeeId].filter(Boolean);
}

export function canViewTask(user, task) {
  if (roleKey(user.role) === "supervisor") {
    return task.departmentId === user.departmentId || task.createdBy === user.id || (task.verifierId || task.supervisorId) === user.id;
  }
  return taskResponsibleIds(task).includes(user.id);
}

export function canManageTask(user, task) {
  return roleKey(user.role) === "supervisor" && canViewTask(user, task);
}

export function canReviewTask(user, task) {
  return roleKey(user.role) === "supervisor" && (task.verifierId || task.supervisorId) === user.id;
}
