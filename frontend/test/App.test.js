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
  role: "Superviseur",
  roleKey: "supervisor",
  departmentId: "d1",
  departmentName: "Production",
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
});
