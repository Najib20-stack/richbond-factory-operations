import { randomUUID } from "node:crypto";

export function createAuditEntry({ actorId, action, targetType, targetId, details = {} }) {
  return {
    id: randomUUID(),
    actorId,
    action,
    targetType,
    targetId,
    details,
    createdAt: new Date().toISOString(),
  };
}

export function addAuditEntry(data, input) {
  const entry = createAuditEntry(input);
  data.auditLog = Array.isArray(data.auditLog) ? data.auditLog : [];
  data.auditLog.unshift(entry);
  data.auditLog = data.auditLog.slice(0, 2000);
  return entry;
}
