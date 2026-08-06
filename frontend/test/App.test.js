import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../app.js";

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => String(name).toLowerCase() === "content-type" ? "application/json" : null },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

const supervisor = {
  id: "s1",
  firstName: "Nadia",
  lastName: "Karimi",
  email: "nadia@test.local",
  role: "Vérificateur/Responsable",
  roleKey: "combined",
  departmentId: "d1",
  departmentName: "Production",
  isActive: true,
};

const administrator = {
  id: "a1",
  firstName: "Amine",
  lastName: "Admin",
  email: "admin@test.local",
  role: "Administrateur",
  roleKey: "admin",
  departmentId: "d1",
  departmentName: "Production",
  isActive: true,
};

const bootstrap = {
  departments: [{ id: "d1", name: "Production" }],
  users: [supervisor],
  tasks: [],
  activities: [],
  notifications: [],
  reports: [],
  weeklyProduction: [],
  kpis: { efficiency: 91 },
};

describe("workflow d'authentification React", () => {
  it("force le remplacement du mot de passe temporaire avant d'ouvrir l'application", async () => {
    const fetchMock = vi.fn(async (url, options) => {
      if (url.endsWith("/api/login")) return jsonResponse(200, { token: "token-1", expiresAt: new Date(Date.now() + 60000).toISOString(), user: { ...supervisor, requiresPasswordChange: true } });
      if (url.endsWith("/api/change-password")) return jsonResponse(200, { user: { ...supervisor, requiresPasswordChange: false } });
      if (url.endsWith("/api/bootstrap")) return jsonResponse(200, bootstrap);
      throw new Error(`Requête inattendue : ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(React.createElement(App));

    await user.type(screen.getByLabelText("Adresse e-mail"), "nadia@test.local");
    await user.type(screen.getByLabelText("Mot de passe"), "richbond123");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("heading", { name: "Créez votre mot de passe" })).toBeTruthy();
    await user.type(screen.getByLabelText("Mot de passe temporaire"), "richbond123");
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "SecureNew2Pass");
    await user.type(screen.getByLabelText("Confirmer le nouveau mot de passe"), "SecureNew2Pass");
    await user.click(screen.getByRole("button", { name: "Enregistrer et continuer" }));

    expect(await screen.findByRole("heading", { name: "Tableau de bord" })).toBeTruthy();
    const authenticatedCalls = fetchMock.mock.calls.filter(([url]) => !url.endsWith("/api/login"));
    expect(authenticatedCalls.every(([, options]) => options.headers.Authorization === "Bearer token-1")).toBe(true);
    expect(JSON.parse(localStorage.getItem("richbond-session")).token).toBe("token-1");
  });

  it("ignore une seconde soumission pendant une connexion en cours", async () => {
    let resolveLogin;
    const pendingLogin = new Promise((resolve) => { resolveLogin = resolve; });
    const fetchMock = vi.fn(() => pendingLogin);
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(App));

    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "nadia@test.local" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "SecurePass1" } });
    const form = screen.getByRole("button", { name: "Se connecter" }).closest("form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveLogin(jsonResponse(401, { error: "Adresse e-mail ou mot de passe incorrect.", code: "INVALID_CREDENTIALS" }));
    expect(await screen.findByText("Adresse e-mail ou mot de passe incorrect.")).toBeTruthy();
  });

  it("affiche une erreur réseau claire sans perdre le formulaire", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const user = userEvent.setup();
    render(React.createElement(App));

    await user.type(screen.getByLabelText("Adresse e-mail"), "nadia@test.local");
    await user.type(screen.getByLabelText("Mot de passe"), "SecurePass1");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Impossible de joindre le serveur Richbond.")).toBeTruthy();
    expect(screen.getByLabelText("Adresse e-mail").value).toBe("nadia@test.local");
    await waitFor(() => expect(screen.getByRole("button", { name: "Se connecter" }).disabled).toBe(false));
  });

  it("place les controles mobiles avant les onglets de navigation", async () => {
    localStorage.setItem("richbond-session", JSON.stringify({
      token: "token-mobile",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: supervisor,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, bootstrap)));
    const { container } = render(React.createElement(App));

    await screen.findByRole("heading", { name: "Tableau de bord" });
    const sidebar = container.querySelector(".sidebar");
    const mobileTools = sidebar.querySelector(".mobile-account-tools");
    const navigation = sidebar.querySelector(".nav-list");
    const children = [...sidebar.children];

    expect(children.indexOf(mobileTools)).toBeLessThan(children.indexOf(navigation));
    expect(container.querySelector('[aria-label="Rechercher"]')).toBeNull();
    expect(mobileTools.querySelector('[aria-label="Changer le thème"]')).toBeTruthy();
    expect(mobileTools.querySelector('[aria-label="Se déconnecter"]')).toBeTruthy();
    expect(container.querySelector(".topbar .desktop-account-tools")).toBeTruthy();
    expect([...navigation.querySelectorAll(".nav-button strong")].map((item) => item.textContent)).toEqual([
      "Tableau de bord",
      "Tâches",
      "À faire",
      "Supervision",
      "Paramètres",
    ]);
    expect(screen.getAllByText("Vérificateur/Responsable").length).toBeGreaterThan(0);
  });

  it("affiche uniquement l'indice d'engagement du compte connecté", async () => {
    const otherUser = { ...supervisor, id: "u2", firstName: "Autre", lastName: "Compte", email: "autre@test.local" };
    const personalTask = {
      id: "RB-PERSONAL",
      title: "Tâche personnelle",
      status: "Completed",
      responsibleIds: [supervisor.id],
      assignedEmployeeId: supervisor.id,
      dueDateLabel: "2026-08-10",
      approvedAt: "2026-08-10T00:00:00Z",
    };
    const otherTask = {
      id: "RB-OTHER",
      title: "Tâche d'un autre compte",
      status: "Completed",
      responsibleIds: [otherUser.id],
      assignedEmployeeId: otherUser.id,
      dueDateLabel: "2026-08-01",
      approvedAt: "2026-08-05T00:00:00Z",
    };
    localStorage.setItem("richbond-session", JSON.stringify({
      token: "token-private-kpi",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: supervisor,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {
      ...bootstrap,
      users: [supervisor, otherUser],
      tasks: [personalTask, otherTask],
    })));
    const { container } = render(React.createElement(App));

    await screen.findByRole("heading", { name: "Tableau de bord" });
    const personalIndex = [...container.querySelectorAll(".metric-card")]
      .find((card) => card.textContent.includes("Indice de respect d'engagement"));

    expect(personalIndex?.querySelector("strong").textContent).toBe("0 j");
    expect(screen.getByText("Vérifications en attente")).toBeTruthy();
    expect(screen.getByText("À vérifier")).toBeTruthy();
    expect(screen.queryByText("Validations en attente")).toBeNull();
    expect(screen.queryByText("À valider")).toBeNull();
    expect(screen.queryByText("Efficacité")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Production hebdomadaire" })).toBeNull();
    expect(screen.queryByText("4 j")).toBeNull();
    expect(container.querySelectorAll(".dashboard-metrics .metric-card > .muted")).toHaveLength(0);
  });

  it("sépare les tâches créées, à réaliser et à vérifier sans afficher les tâches sans lien", async () => {
    const otherUser = { ...supervisor, id: "u2", firstName: "Salma", lastName: "Alaoui", email: "salma@test.local" };
    const assignedTask = {
      id: "RB-TEST",
      title: "Contrôler le lot pilote",
      description: "Vérification avant lancement.",
      taskType: "normal",
      departmentId: "d1",
      departmentName: "Production",
      responsibleIds: [supervisor.id],
      assignedEmployeeId: supervisor.id,
      assignedEmployeeName: "Nadia Karimi",
      responsibleNames: "Nadia Karimi",
      verifierId: otherUser.id,
      verifierName: "Salma Alaoui",
      createdBy: otherUser.id,
      status: "Ready",
      dueDateLabel: "2026-08-10",
      notes: [],
    };
    const createdTask = {
      ...assignedTask,
      id: "RB-CREATED",
      title: "Tâche créée personnellement",
      responsibleIds: [otherUser.id],
      assignedEmployeeId: otherUser.id,
      assignedEmployeeName: "Salma Alaoui",
      responsibleNames: "Salma Alaoui",
      createdBy: supervisor.id,
    };
    const consolidationTask = {
      ...createdTask,
      id: "RB-CONSOLIDATION",
      title: "Consolider les contrôles du lot",
      taskType: "consolidation",
      consolidationType: "urgent_meeting",
    };
    const verificationTask = {
      ...createdTask,
      id: "RB-VERIFY",
      title: "Tâche à vérifier personnellement",
      verifierId: supervisor.id,
      verifierName: "Nadia Karimi",
      createdBy: otherUser.id,
      status: "Waiting for Review",
    };
    const unrelatedTask = {
      ...createdTask,
      id: "RB-HIDDEN",
      title: "Tâche sans lien avec ce compte",
      verifierId: otherUser.id,
      createdBy: otherUser.id,
    };
    localStorage.setItem("richbond-session", JSON.stringify({
      token: "token-tasks",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: supervisor,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {
      ...bootstrap,
      users: [supervisor, otherUser],
      tasks: [assignedTask, createdTask, consolidationTask, verificationTask, unrelatedTask],
    })));
    const user = userEvent.setup();
    const { container } = render(React.createElement(App));

    await screen.findByRole("heading", { name: "Tableau de bord" });
    await user.click(screen.getByRole("button", { name: "Tâches" }));

    expect(await screen.findByRole("heading", { name: "Tâches créées par moi" })).toBeTruthy();
    expect(screen.getAllByText("Tâche créée personnellement").length).toBeGreaterThan(0);
    expect(container.querySelector('.task-card[data-task-type="normal"]')?.classList.contains("task-card-normal")).toBe(true);
    expect(container.querySelector('.task-card[data-task-type="consolidation"]')?.classList.contains("task-card-consolidation")).toBe(true);
    expect(screen.getAllByText(/Tâche de consolidation \/ Réunion urgente/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Contrôler le lot pilote")).toBeNull();
    expect(screen.queryByText("Tâche à vérifier personnellement")).toBeNull();
    expect(screen.queryByText("Tâche sans lien avec ce compte")).toBeNull();
    await user.click(screen.getByRole("button", { name: "+ Nouvelle tâche" }));

    expect(screen.getByLabelText("Priorité optionnelle").required).toBe(false);
    expect(screen.queryByLabelText("Durée estimée")).toBeNull();

    await user.click(screen.getByRole("button", { name: "À faire" }));
    expect((await screen.findAllByRole("heading", { name: "À faire" })).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Actions de production" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeTruthy();
    expect(screen.getByText("Contrôler le lot pilote")).toBeTruthy();
    expect(screen.queryByText("Tâche créée personnellement")).toBeNull();
    expect(screen.queryByText("Tâche à vérifier personnellement")).toBeNull();
    expect(screen.queryByText("Tâche sans lien avec ce compte")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Supervision" }));
    expect(await screen.findByText(/Tâche à vérifier personnellement/)).toBeTruthy();
    expect(screen.getAllByText(/Tâche créée personnellement/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Charge de l'équipe" })).toBeNull();
    expect(screen.queryByText("Contrôler le lot pilote")).toBeNull();
    expect(screen.queryByText("Tâche sans lien avec ce compte")).toBeNull();
  });

  it("permet de démarrer puis de marquer comme terminée une tâche affectée", async () => {
    let assignedTask = {
      id: "RB-TODO",
      title: "Assembler le lot test",
      description: "Assembler puis contrôler le lot avant vérification.",
      taskType: "normal",
      departmentId: "d1",
      departmentName: "Production",
      responsibleIds: [supervisor.id],
      assignedEmployeeId: supervisor.id,
      assignedEmployeeName: "Nadia Karimi",
      responsibleNames: "Nadia Karimi",
      verifierId: "u2",
      verifierName: "Salma Alaoui",
      createdBy: "u2",
      status: "Ready",
      dueDateLabel: "2026-08-10",
      notes: [],
    };
    localStorage.setItem("richbond-session", JSON.stringify({
      token: "token-todo",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: supervisor,
    }));
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/api/bootstrap")) {
        return jsonResponse(200, { ...bootstrap, tasks: [assignedTask] });
      }
      if (url.endsWith("/api/tasks/RB-TODO") && options.method === "PATCH") {
        assignedTask = { ...assignedTask, ...JSON.parse(options.body) };
        return jsonResponse(200, assignedTask);
      }
      throw new Error(`Requête inattendue : ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(React.createElement(App));

    await screen.findByRole("heading", { name: "Tableau de bord" });
    await user.click(screen.getByRole("button", { name: "À faire" }));
    expect(await screen.findByText("Assembler le lot test")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Démarrer" }));
    await user.click(await screen.findByRole("button", { name: "Marquer comme terminée" }));

    expect(await screen.findByText("La tâche est marquée comme terminée et envoyée au vérificateur.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Terminées - en attente de vérification" })).toBeTruthy();
    const statuses = fetchMock.mock.calls
      .filter(([url, options]) => url.endsWith("/api/tasks/RB-TODO") && options.method === "PATCH")
      .map(([, options]) => JSON.parse(options.body).status);
    expect(statuses).toEqual(["In Progress", "Waiting for Review"]);
  });

  it("exige un motif lorsque le vérificateur rejette une tâche", async () => {
    const responsible = { ...supervisor, id: "u2", firstName: "Salma", lastName: "Alaoui", email: "salma@test.local" };
    let reviewTask = {
      id: "RB-REVIEW",
      title: "Vérifier la finition du lot",
      description: "Contrôle final avant clôture.",
      taskType: "normal",
      departmentId: "d1",
      departmentName: "Production",
      responsibleIds: [responsible.id],
      assignedEmployeeId: responsible.id,
      assignedEmployeeName: "Salma Alaoui",
      responsibleNames: "Salma Alaoui",
      verifierId: supervisor.id,
      verifierName: "Nadia Karimi",
      createdBy: responsible.id,
      status: "Waiting for Review",
      dueDateLabel: "2026-08-10",
      notes: [],
    };
    localStorage.setItem("richbond-session", JSON.stringify({
      token: "token-rejection",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: supervisor,
    }));
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/api/bootstrap")) {
        return jsonResponse(200, { ...bootstrap, users: [supervisor, responsible], tasks: [reviewTask] });
      }
      if (url.endsWith("/api/tasks/RB-REVIEW") && options.method === "PATCH") {
        const patchBody = JSON.parse(options.body);
        reviewTask = {
          ...reviewTask,
          ...patchBody,
          rejectionReason: patchBody.note,
          rejectedBy: supervisor.id,
          rejectedByName: "Nadia Karimi",
          rejectedAt: "2026-08-06T10:00:00.000Z",
        };
        return jsonResponse(200, reviewTask);
      }
      throw new Error(`Requête inattendue : ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(React.createElement(App));

    await screen.findByRole("heading", { name: "Tableau de bord" });
    await user.click(screen.getByRole("button", { name: "Supervision" }));
    await user.click(await screen.findByRole("button", { name: "Rejeter" }));

    const reasonInput = screen.getByLabelText("Motif du rejet");
    expect(reasonInput.required).toBe(true);
    expect(screen.getByRole("button", { name: "Confirmer le rejet" }).disabled).toBe(true);

    const reason = "La couture latérale doit être reprise.";
    await user.type(reasonInput, reason);
    await user.click(screen.getByRole("button", { name: "Confirmer le rejet" }));

    expect(await screen.findByText("La tâche a été rejetée et renvoyée au responsable.")).toBeTruthy();
    const rejectionCall = fetchMock.mock.calls.find(([url, options]) => url.endsWith("/api/tasks/RB-REVIEW") && options.method === "PATCH");
    expect(JSON.parse(rejectionCall[1].body)).toEqual({ status: "Rejected", note: reason });
  });

  it("montre clairement le motif du rejet au responsable affecté", async () => {
    const rejectionReason = "Remplacer la couture latérale avant de soumettre à nouveau.";
    const rejectedTask = {
      id: "RB-REJECTED",
      title: "Corriger la finition du lot",
      description: "Reprendre le contrôle de finition.",
      taskType: "normal",
      departmentId: "d1",
      departmentName: "Production",
      responsibleIds: [supervisor.id],
      assignedEmployeeId: supervisor.id,
      assignedEmployeeName: "Nadia Karimi",
      responsibleNames: "Nadia Karimi",
      verifierId: "u2",
      verifierName: "Salma Alaoui",
      createdBy: "u2",
      status: "Rejected",
      dueDateLabel: "2026-08-10",
      rejectionReason,
      rejectedBy: "u2",
      rejectedByName: "Salma Alaoui",
      rejectedAt: "2026-08-06T10:00:00.000Z",
      notes: [{ id: "n1", message: rejectionReason, createdBy: "u2", createdAt: "2026-08-06T10:00:00.000Z" }],
    };
    localStorage.setItem("richbond-session", JSON.stringify({
      token: "token-rejected-task",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: supervisor,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ...bootstrap, tasks: [rejectedTask] })));
    const user = userEvent.setup();
    render(React.createElement(App));

    await screen.findByRole("heading", { name: "Tableau de bord" });
    await user.click(screen.getByRole("button", { name: "À faire" }));

    expect(await screen.findByRole("region", { name: "Motif du rejet" })).toBeTruthy();
    expect(screen.getAllByText(rejectionReason).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Salma Alaoui/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeTruthy();
  });

  it("réserve les vues globales, les rapports et les utilisateurs à l'administrateur", async () => {
    const productionUser = { ...supervisor, id: "u1", firstName: "Nadia", lastName: "Production" };
    const qualityUser = { ...supervisor, id: "u2", firstName: "Salma", lastName: "Qualité", email: "salma@test.local", departmentId: "d2", departmentName: "Qualité" };
    const productionTask = {
      id: "RB-PROD",
      title: "Contrôle du département Production",
      description: "Vérifier le lot de production.",
      taskType: "normal",
      departmentId: "d1",
      departmentName: "Production",
      responsibleIds: [productionUser.id],
      assignedEmployeeId: productionUser.id,
      responsibleNames: "Nadia Production",
      verifierId: qualityUser.id,
      verifierName: "Salma Qualité",
      createdBy: qualityUser.id,
      creatorName: "Salma Qualité",
      status: "In Progress",
      dueDateLabel: "2026-08-04",
      notes: [],
    };
    const qualityTask = {
      ...productionTask,
      id: "RB-QUAL",
      title: "Inspection mousse Qualité",
      departmentId: "d2",
      departmentName: "Qualité",
      responsibleIds: [qualityUser.id],
      assignedEmployeeId: qualityUser.id,
      responsibleNames: "Salma Qualité",
      createdBy: productionUser.id,
      creatorName: "Nadia Production",
      status: "Waiting for Review",
    };
    localStorage.setItem("richbond-session", JSON.stringify({
      token: "token-admin",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: administrator,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {
      ...bootstrap,
      departments: [{ id: "d1", name: "Production" }, { id: "d2", name: "Qualité" }],
      users: [administrator, productionUser, qualityUser],
      tasks: [productionTask, qualityTask],
      reports: [{ id: "r1", name: "Rapport de production", description: "Synthèse", status: "Ready" }],
    })));
    const user = userEvent.setup();
    const { container } = render(React.createElement(App));

    await screen.findByRole("heading", { name: "Tableau de bord" });
    expect([...container.querySelectorAll(".nav-button strong")].map((item) => item.textContent)).toEqual([
      "Tableau de bord",
      "Tâches",
      "Supervision",
      "Utilisateurs",
      "Rapports",
      "Paramètres",
    ]);
    expect(screen.queryByRole("button", { name: "À faire" })).toBeNull();
    expect(screen.getByLabelText("Rechercher")).toBeTruthy();
    expect(screen.getByLabelText("Filtrer par département")).toBeTruthy();
    expect(screen.getByText("Nadia Production")).toBeTruthy();
    expect(screen.getByText("Salma Qualité")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Filtrer par département"), "d2");
    expect(screen.getByText(/Inspection mousse Qualité/)).toBeTruthy();
    expect(screen.queryByText(/Contrôle du département Production/)).toBeNull();
    expect(screen.queryByText("Nadia Production")).toBeNull();
    expect(screen.getByText("Salma Qualité")).toBeTruthy();

    await user.clear(screen.getByLabelText("Rechercher"));
    await user.type(screen.getByLabelText("Rechercher"), "RB-QUAL");
    expect(screen.getByText(/Inspection mousse Qualité/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Supervision" }));
    expect(await screen.findByRole("heading", { name: "Engagement des utilisateurs" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Charge de l'équipe" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Utilisateurs" }));
    expect(await screen.findByRole("heading", { name: "Utilisateurs" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Utilisateurs de l'usine" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Rapports" }));
    expect(await screen.findByRole("heading", { name: "Rapports" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tableau de bord des engagements" })).toBeTruthy();
  });
});
