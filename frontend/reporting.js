export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function filterTasksForReport(tasks, filters) {
  return tasks.filter((task) => {
    const createdDate = String(task.createdAt || "").slice(0, 10);
    const matchesStart = !filters.startDate || createdDate >= filters.startDate;
    const matchesEnd = !filters.endDate || createdDate <= filters.endDate;
    const matchesDepartment = !filters.departmentId || task.departmentId === filters.departmentId;
    return matchesStart && matchesEnd && matchesDepartment;
  });
}

export function summarizeReport(tasks) {
  return {
    total: tasks.length,
    completed: tasks.filter((task) => ["Approved", "Completed"].includes(task.status)).length,
    blocked: tasks.filter((task) => task.status === "Blocked").length,
    review: tasks.filter((task) => task.status === "Waiting for Review").length,
  };
}

function statusExcelClass(status) {
  if (["Approved", "Completed"].includes(status)) return "status-approved";
  if (status === "Waiting for Review") return "status-review";
  if (status === "Blocked") return "status-blocked";
  return "";
}

export function buildProductionReportHtml({ tasks, filters, departments, formatters, generatedAt }) {
  const departmentName = filters.departmentId
    ? departments.find((department) => department.id === filters.departmentId)?.name || filters.departmentId
    : "Tous les départements";
  const summary = summarizeReport(tasks);
  const rows = tasks.map((task, index) => `
    <tr class="${statusExcelClass(task.status)}">
      <td>${index + 1}</td>
      <td>${escapeHtml(task.id)}</td>
      <td>${escapeHtml(task.title)}</td>
      <td>${escapeHtml(formatters.status(task.status))}</td>
      <td>${escapeHtml(formatters.priority(task.priority))}</td>
      <td>${escapeHtml(task.departmentName)}</td>
      <td>${escapeHtml(task.assignedEmployeeName)}</td>
      <td>${escapeHtml(task.batchNumber)}</td>
      <td>${escapeHtml(task.quantity)}</td>
      <td>${escapeHtml(task.productionLine)}</td>
      <td>${escapeHtml(formatters.due(task.dueDateLabel))}</td>
      <td>${escapeHtml(String(task.createdAt || "").slice(0, 10))}</td>
      <td>${escapeHtml(Array.isArray(task.notes) && task.notes[0] ? task.notes[0].message : "")}</td>
    </tr>`).join("");

  return `
    <table>
      <tr><td class="title" colspan="13">Rapport de production Richbond</td></tr>
      <tr><td class="label">Généré le</td><td colspan="12">${escapeHtml(generatedAt)}</td></tr>
      <tr><td class="label">Période</td><td colspan="12">${escapeHtml(filters.startDate || "Début")} au ${escapeHtml(filters.endDate || "Fin")}</td></tr>
      <tr><td class="label">Département</td><td colspan="12">${escapeHtml(departmentName)}</td></tr>
      <tr><td class="label">Type de rapport</td><td colspan="12">Tâches de production</td></tr>
      <tr><td colspan="13"></td></tr>
      <tr><td class="section" colspan="13">Résumé</td></tr>
      <tr>
        <td class="label">Tâches exportées</td><td class="metric">${summary.total}</td>
        <td class="label">Terminées</td><td class="metric">${summary.completed}</td>
        <td class="label">En validation</td><td class="metric">${summary.review}</td>
        <td class="label">Bloquées</td><td class="metric">${summary.blocked}</td>
        <td colspan="5" class="muted">Les lignes colorées indiquent les statuts importants.</td>
      </tr>
      <tr><td colspan="13"></td></tr>
      <tr><td class="section" colspan="13">Détails des tâches</td></tr>
      <tr>
        <th>N</th><th>ID</th><th>Tâche</th><th>Statut</th><th>Priorité</th><th>Département</th>
        <th>Employé</th><th>Lot</th><th>Quantité</th><th>Ligne</th><th>Échéance</th><th>Créée le</th><th>Dernière note</th>
      </tr>
      ${rows || '<tr><td colspan="13">Aucune tâche trouvée pour ces filtres.</td></tr>'}
    </table>`;
}
