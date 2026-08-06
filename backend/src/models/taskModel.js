import { randomUUID } from "node:crypto";

export function createTask(input) {
  const now = new Date().toISOString();
  return {
    id: `RB-${randomUUID().slice(0, 8).toUpperCase()}`,
    clientRequestId: input.clientRequestId || "",
    title: input.title,
    description: input.description,
    taskType: input.taskType,
    consolidationType: input.consolidationType,
    productType: input.productType,
    batchNumber: input.batchNumber,
    quantity: input.quantity,
    productionLine: input.productionLine,
    departmentId: input.departmentId,
    assignedEmployeeId: input.responsibleIds[0],
    responsibleIds: input.responsibleIds,
    verifierId: input.verifierId,
    supervisorId: input.verifierId,
    priority: input.priority,
    status: "Ready",
    estimatedDuration: input.estimatedDuration,
    dueDateLabel: input.dueDateLabel,
    dueDateChangeRequest: "",
    attachments: [],
    notes: [],
    createdBy: input.createdBy,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    approvedAt: null,
    rejectionReason: "",
    rejectedBy: null,
    rejectedAt: null,
    refusalCount: 0,
  };
}
