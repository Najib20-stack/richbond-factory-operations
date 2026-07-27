const statusLabels = {
  Pending: "en attente",
  Ready: "en cours",
  "In Progress": "en cours",
  "On Hold": "en pause",
  "Waiting for Review": "en attente de vérification",
  Approved: "terminée",
  Completed: "terminée",
  Blocked: "bloquée",
  Cancelled: "annulée",
  Rejected: "refusée",
};

export function statusLabel(status) {
  return statusLabels[status] || status;
}
