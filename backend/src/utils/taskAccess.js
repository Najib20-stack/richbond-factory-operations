import { roleKey } from "./roles.js";

export function taskResponsibleIds(task) {
  return Array.isArray(task.responsibleIds) && task.responsibleIds.length
    ? task.responsibleIds
    : [task.assignedEmployeeId].filter(Boolean);
}

export function canViewTask(user, task) {
  const role = roleKey(user?.role);
  if (role === "admin") return true;
  if (role !== "combined") return false;
  return task.createdBy === user.id
    || (task.verifierId || task.supervisorId) === user.id
    || taskResponsibleIds(task).includes(user.id);
}

export function canManageTask(user, task) {
  const role = roleKey(user?.role);
  return role === "admin" || (role === "combined" && task.createdBy === user.id);
}

export function canReviewTask(user, task) {
  return roleKey(user?.role) === "combined" && (task.verifierId || task.supervisorId) === user.id;
}
