export function createTask(input) {
  const now = new Date().toISOString();
  const responsibleIds = Array.isArray(input.responsibleIds) && input.responsibleIds.length
    ? input.responsibleIds
    : [input.assignedEmployeeId || "u-1"];
  const verifierId = input.verifierId || input.supervisorId || "u-5";

  return {
    id: `RB-N${Math.floor(Math.random() * 9000 + 1000)}`,
    title: input.title || "Nouvelle tâche",
    description: input.description || "",
    taskType: input.taskType || "normal",
    consolidationType: input.consolidationType || "",
    productType: input.productType || "",
    batchNumber: input.batchNumber || "",
    quantity: Number(input.quantity || 1),
    productionLine: input.productionLine || "",
    departmentId: input.departmentId || "bigbed",
    assignedEmployeeId: responsibleIds[0],
    responsibleIds,
    verifierId,
    supervisorId: verifierId,
    priority: input.priority || "",
    status: input.status || "In Progress",
    estimatedDuration: input.estimatedDuration || "1h",
    dueDateLabel: input.dueDateLabel || input.dueDate || "Demain",
    dueDateChangeRequest: "",
    attachments: [],
    createdBy: input.createdBy || "u-5",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    approvedAt: null,
  };
}
