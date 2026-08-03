import { describe, expect, it } from "vitest";
import { buildProductionReportHtml, escapeHtml, filterTasksForReport, summarizeReport } from "../reporting.js";

const tasks = [
  { id: "T1", title: "Contrôle", status: "Completed", priority: "High", departmentId: "d1", departmentName: "Production", assignedEmployeeName: "Ali", createdAt: "2026-08-01T10:00:00Z", dueDateLabel: "2026-08-03", notes: [] },
  { id: "T2", title: "Mesure", status: "Blocked", priority: "Medium", departmentId: "d2", departmentName: "Qualité", assignedEmployeeName: "Sara", createdAt: "2026-08-02T10:00:00Z", dueDateLabel: "2026-08-04", notes: [] },
  { id: "T3", title: "Validation", status: "Waiting for Review", priority: "Low", departmentId: "d1", departmentName: "Production", assignedEmployeeName: "Ali", createdAt: "2026-08-03T10:00:00Z", dueDateLabel: "2026-08-05", notes: [] },
];

describe("génération des rapports", () => {
  it("filtre une seule fois par période et département", () => {
    const filtered = filterTasksForReport(tasks, { startDate: "2026-08-01", endDate: "2026-08-02", departmentId: "d1" });
    expect(filtered.map((task) => task.id)).toEqual(["T1"]);
  });

  it("calcule un résumé compréhensible", () => {
    expect(summarizeReport(tasks)).toEqual({ total: 3, completed: 1, blocked: 1, review: 1 });
  });

  it("produit un tableau structuré et neutralise le contenu HTML", () => {
    const malicious = { ...tasks[0], title: '<script>alert("x")</script>', notes: [{ message: "<b>note</b>" }] };
    const html = buildProductionReportHtml({
      tasks: [malicious],
      filters: { startDate: "2026-08-01", endDate: "2026-08-03", departmentId: "d1" },
      departments: [{ id: "d1", name: "Production" }],
      formatters: { status: (value) => value, priority: (value) => value, due: (value) => value },
      generatedAt: "02/08/2026 12:00",
    });

    expect(html).toContain("Rapport de production Richbond");
    expect(html).toContain("Résumé");
    expect(html).toContain("Détails des tâches");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(escapeHtml("A&B")).toBe("A&amp;B");
  });
});
