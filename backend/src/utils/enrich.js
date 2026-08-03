import { roleKey } from "./roles.js";

export function enrich(data) {
  const departments = new Map(data.departments.map((department) => [department.id, department]));
  const users = new Map(data.users.map((user) => [user.id, user]));

  const enrichedUsers = data.users.map((user) => {
    const { passwordHash: _passwordHash, mustChangePassword, ...safeUser } = user;
    return {
      ...safeUser,
      requiresPasswordChange: Boolean(mustChangePassword),
      roleKey: roleKey(user.role),
      departmentName: departments.get(user.departmentId)?.name || "Operations",
    };
  });

  const enrichedTasks = data.tasks.map((task) => {
    const responsibleIds = Array.isArray(task.responsibleIds) && task.responsibleIds.length
      ? task.responsibleIds
      : [task.assignedEmployeeId].filter(Boolean);
    const responsibleUsers = responsibleIds.map((id) => users.get(id)).filter(Boolean);
    const employee = users.get(task.assignedEmployeeId);
    const verifier = users.get(task.verifierId || task.supervisorId);
    const supervisor = users.get(task.supervisorId);
    const creator = users.get(task.createdBy);

    return {
      ...task,
      responsibleIds,
      departmentName: departments.get(task.departmentId)?.name || "Non affecté",
      assignedEmployeeName: employee ? `${employee.firstName} ${employee.lastName}` : "Non affecté",
      responsibleNames: responsibleUsers.length ? responsibleUsers.map((user) => `${user.firstName} ${user.lastName}`).join(", ") : "Non affecté",
      verifierName: verifier ? `${verifier.firstName} ${verifier.lastName}` : "Non affecté",
      supervisorName: supervisor ? `${supervisor.firstName} ${supervisor.lastName}` : "Non affecté",
      creatorName: creator ? `${creator.firstName} ${creator.lastName}` : "Non affecté",
    };
  });

  return {
    kpis: data.kpis || {},
    weeklyProduction: data.weeklyProduction || [],
    departments: data.departments || [],
    users: enrichedUsers,
    tasks: enrichedTasks,
    activities: data.activities || [],
    reports: data.reports || [],
    notifications: data.notifications || [],
  };
}
