import { randomUUID } from "node:crypto";

export function addAuditEntry(data, { actorId, action, targetType, targetId, details = {} }) {
  data.auditLog = Array.isArray(data.auditLog) ? data.auditLog : [];
  data.auditLog.unshift({
    id: randomUUID(),
    actorId,
    action,
    targetType,
    targetId,
    details,
    createdAt: new Date().toISOString(),
  });
  data.auditLog = data.auditLog.slice(0, 2000);
}
