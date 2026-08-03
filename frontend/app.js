import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Moon,
  PanelsTopLeft,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Users as UsersIcon,
  WifiOff,
} from "lucide";
import { ApiError, createApiClient } from "./apiClient.js";
import richbondLogoUrl from "./assets/richbond-logo.svg";
import { buildProductionReportHtml, filterTasksForReport, summarizeReport } from "./reporting.js";
import { clearSession, loadSession, saveSession } from "./sessionStore.js";
import "./styles.css";

const h = React.createElement;
const apiClient = createApiClient();
const LUCIDE_ICONS = {
  "alert-triangle": AlertTriangle,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  "chart-no-axes-combined": ChartNoAxesCombined,
  "check-circle-2": CheckCircle2,
  "chevron-right": ChevronRight,
  "clipboard-check": ClipboardCheck,
  "key-round": KeyRound,
  "layout-dashboard": LayoutDashboard,
  "loader-circle": LoaderCircle,
  "lock-keyhole": LockKeyhole,
  "log-out": LogOut,
  mail: Mail,
  moon: Moon,
  "panels-top-left": PanelsTopLeft,
  "refresh-cw": RefreshCw,
  search: Search,
  "settings-2": Settings2,
  "shield-check": ShieldCheck,
  sun: Sun,
  users: UsersIcon,
  "wifi-off": WifiOff,
};

const emptyData = { departments: [], users: [], tasks: [], activities: [], notifications: [], reports: [], weeklyProduction: [], kpis: {} };

const navItems = [
  { id: "dashboard", label: "Tableau de bord", icon: "layout-dashboard", roles: ["supervisor"] },
  { id: "tasks", label: "Tâches", icon: "panels-top-left", roles: ["supervisor", "employee"] },
  { id: "employee", label: "Responsable", icon: "clipboard-check", roles: ["employee"] },
  { id: "supervisor", label: "Supervision", icon: "shield-check", roles: ["supervisor"] },
  { id: "reports", label: "Rapports", icon: "chart-no-axes-combined", roles: ["supervisor"] },
  { id: "users", label: "Utilisateurs", icon: "users", roles: ["supervisor"] },
  { id: "settings", label: "Paramètres", icon: "settings-2", roles: ["supervisor"] },
];

const statusLabels = {
  Pending: "En attente",
  Ready: "À démarrer",
  "In Progress": "En cours",
  "On Hold": "En pause",
  "Waiting for Review": "En attente de vérification",
  Approved: "Terminée",
  Completed: "Terminée",
  Blocked: "Bloquée",
  Cancelled: "Annulée",
  Rejected: "Refusée",
  Overdue: "En retard",
  Processing: "En traitement",
};

const priorityLabels = { Low: "Basse", Medium: "Moyenne", High: "Haute", Critical: "Critique" };
const taskTypeLabels = { normal: "Tâche normale", consolidation: "Tâche de consolidation" };
const consolidationLabels = { normal_send: "Envoi normal", urgent_meeting: "Réunion urgente" };
const dueLabels = {
  Tomorrow: "Demain",
  Overdue: "En retard",
  "Today 11:00": "Aujourd'hui 11:00",
  "Today 13:00": "Aujourd'hui 13:00",
  "Today 14:30": "Aujourd'hui 14:30",
  "Today 16:00": "Aujourd'hui 16:00",
  "Today 18:00": "Aujourd'hui 18:00",
};

function roleKey(role) {
  const normalized = String(role || "").toLowerCase();
  return normalized.includes("admin") || normalized.includes("super") ? "supervisor" : "employee";
}

function statusLabel(value) {
  return statusLabels[value] || value;
}

function priorityLabel(value) {
  return priorityLabels[value] || value;
}

function dueLabel(value) {
  return dueLabels[value] || value;
}

function statusClass(value) {
  if (["Completed", "Approved"].includes(value)) return "green";
  if (["In Progress", "Ready"].includes(value)) return "blue";
  if (["Waiting for Review", "On Hold"].includes(value)) return "amber";
  if (["Blocked", "Critical", "Overdue", "Rejected"].includes(value)) return "red";
  return "";
}

function priorityClass(value) {
  return value === "Critical" ? "red" : value === "High" ? "amber" : value === "Medium" ? "blue" : "green";
}

function userFullName(user) {
  return `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
}

function taskResponsibleIds(task) {
  return Array.isArray(task.responsibleIds) && task.responsibleIds.length ? task.responsibleIds : [task.assignedEmployeeId].filter(Boolean);
}

function taskDelayDays(task) {
  const due = Date.parse(task.dueDateLabel || "");
  const done = Date.parse(task.approvedAt || task.completedAt || new Date().toISOString());
  if (!Number.isFinite(due) || !Number.isFinite(done)) return 0;
  return Math.max(0, Math.ceil((done - due) / 86400000));
}

function commitmentIndex(tasks, userId) {
  const userTasks = tasks.filter((task) => taskResponsibleIds(task).includes(userId));
  if (!userTasks.length) return 0;
  const totalDelay = userTasks.reduce((sum, task) => sum + taskDelayDays(task), 0);
  return Number((totalDelay / userTasks.length).toFixed(1));
}

function Icon({ name, size = 18 }) {
  const iconNode = LUCIDE_ICONS[name];
  if (!iconNode) return null;

  return h(
    "svg",
    {
      className: `lucide lucide-${name}`,
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      focusable: "false",
      "aria-hidden": true,
    },
    ...iconNode.map(([tag, attrs], index) => h(tag, { ...attrs, key: `${name}-${index}` })),
  );
}

function RichbondLogo() {
  return h("img", { className: "brand-logo", src: richbondLogoUrl, alt: "Richbond" });
}

function Pill({ children, color = "" }) {
  return h("span", { className: `pill ${color}` }, children);
}

function Metric({ label, value, detail }) {
  return h(
    "article",
    { className: "metric-card" },
    h("div", { className: "metric-topline" }, h("small", null, label), h("span", { className: "metric-signal", "aria-hidden": true })),
    h("strong", null, value),
    h("span", { className: "muted" }, detail),
  );
}

function Brand({ login = false }) {
  return h(
    "div",
    { className: `brand brand-logo-card ${login ? "login-brand" : ""}` },
    h(RichbondLogo),
    h("div", null, h("span", null, "Operations Usine")),
  );
}

function useUnsavedChanges(isDirty) {
  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
}

function StatusBanner({ kind = "info", message, onRetry, onClose }) {
  if (!message) return null;
  const icon = kind === "offline" ? "wifi-off" : kind === "success" ? "check-circle-2" : "alert-triangle";
  return h(
    "div",
    { className: `status-banner ${kind}`, role: kind === "error" || kind === "offline" ? "alert" : "status" },
    h(Icon, { name: icon, size: 19 }),
    h("span", null, message),
    onRetry && h("button", { className: "banner-button", type: "button", onClick: onRetry }, h(Icon, { name: "refresh-cw", size: 16 }), "Réessayer"),
    onClose && h("button", { className: "banner-close", type: "button", onClick: onClose, "aria-label": "Fermer le message" }, "×"),
  );
}

function LoadingState({ label = "Chargement des données..." }) {
  return h("div", { className: "loading-state", role: "status" }, h(Icon, { name: "loader-circle", size: 25 }), h("span", null, label));
}

function Login({ onLogin, initialMessage = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => setMessage(initialMessage), [initialMessage]);

  async function submit(event) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setMessage("Connexion sécurisée en cours...");
    try {
      await onLogin(email, password);
    } catch (error) {
      if (error?.code === "LOGIN_RATE_LIMITED") setMessage(`${error.message}${error.retryAfter ? ` Réessayez dans ${error.retryAfter} s.` : ""}`);
      else if (error?.code === "INVALID_CREDENTIALS") setMessage("Adresse e-mail ou mot de passe incorrect.");
      else setMessage(error?.message || "La connexion a échoué.");
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  return h(
    "section",
    { className: "login-screen" },
    h(
      "div",
      { className: "login-panel" },
      h(
        "div",
        { className: "login-intro" },
        h(Brand, { login: true }),
        h(
          "div",
          { className: "login-intro-copy" },
          h("span", { className: "system-status" }, h("span", { className: "pulse-dot" }), "Système opérationnel"),
          h("h2", null, "Pilotez l'excellence industrielle."),
          h("p", null, "Une vision claire des tâches, des engagements et des validations de votre usine."),
        ),
        h(
          "div",
          { className: "login-stats" },
          h("div", null, h("strong", null, "Temps réel"), h("span", null, "Suivi de production")),
          h("div", null, h("strong", null, "2 espaces"), h("span", null, "Accès par fonction")),
        ),
      ),
      h(
        "div",
        { className: "login-content" },
        h("div", null, h("p", { className: "eyebrow" }, "Portail Richbond"), h("h1", null, "Bienvenue"), h("p", { className: "muted" }, "Connectez-vous à votre espace de travail sécurisé.")),
        h(
          "form",
          { className: "login-form", onSubmit: submit, "aria-busy": busy },
          h("label", null, h("span", null, "Adresse e-mail"), h("div", { className: "input-with-icon" }, h(Icon, { name: "mail" }), h("input", { type: "email", value: email, autoComplete: "username", onChange: (e) => setEmail(e.target.value), disabled: busy, required: true }))),
          h("label", null, h("span", null, "Mot de passe"), h("div", { className: "input-with-icon" }, h(Icon, { name: "lock-keyhole" }), h("input", { type: "password", value: password, autoComplete: "current-password", onChange: (e) => setPassword(e.target.value), disabled: busy, required: true }))),
          h("button", { className: "primary-button login-submit", type: "submit", disabled: busy }, h("span", null, busy ? "Connexion..." : "Se connecter"), h(Icon, { name: busy ? "loader-circle" : "arrow-right" })),
          h("p", { className: "form-message muted" }, message),
        ),
        h("div", { className: "security-note" }, h(Icon, { name: "shield-check" }), h("span", null, "Votre accès est personnel. Les tentatives et les actions sensibles sont protégées et journalisées.")),
      ),
    ),
  );
}

function PasswordChange({ user, onChangePassword, onLogout }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmation: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);
  useUnsavedChanges(Object.values(form).some(Boolean) && !busy);

  async function submit(event) {
    event.preventDefault();
    if (submitLock.current) return;
    if (form.newPassword !== form.confirmation) {
      setMessage("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    submitLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await onChangePassword(form.currentPassword, form.newPassword);
    } catch (error) {
      setMessage(error?.message || "Le mot de passe n'a pas pu être modifié.");
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  return h(
    "section",
    { className: "login-screen" },
    h(
      "div",
      { className: "password-panel" },
      h(Brand, { login: true }),
      h("div", null, h("p", { className: "eyebrow" }, "Sécurisation du compte"), h("h1", null, "Créez votre mot de passe"), h("p", { className: "muted" }, `${userFullName(user)}, le mot de passe temporaire doit être remplacé avant d'accéder à l'application.`)),
      h(
        "form",
        { className: "login-form", onSubmit: submit, "aria-busy": busy },
        h("label", null, h("span", null, "Mot de passe temporaire"), h("input", { type: "password", autoComplete: "current-password", value: form.currentPassword, disabled: busy, required: true, onChange: (event) => setForm((current) => ({ ...current, currentPassword: event.target.value })) })),
        h("label", null, h("span", null, "Nouveau mot de passe"), h("input", { type: "password", autoComplete: "new-password", minLength: 10, value: form.newPassword, disabled: busy, required: true, onChange: (event) => setForm((current) => ({ ...current, newPassword: event.target.value })) })),
        h("label", null, h("span", null, "Confirmer le nouveau mot de passe"), h("input", { type: "password", autoComplete: "new-password", minLength: 10, value: form.confirmation, disabled: busy, required: true, onChange: (event) => setForm((current) => ({ ...current, confirmation: event.target.value })) })),
        h("p", { className: "password-rules muted" }, "Au moins 10 caractères, avec une majuscule, une minuscule et un chiffre."),
        h("button", { className: "primary-button", type: "submit", disabled: busy }, busy ? "Enregistrement..." : "Enregistrer et continuer"),
        h("p", { className: "form-message error-text", role: "alert" }, message),
      ),
      h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: onLogout }, "Se déconnecter"),
    ),
  );
}

function TaskRow({ task, compact = false, selected = false, onOpen }) {
  const latestNote = Array.isArray(task.notes) && task.notes[0] ? task.notes[0].message : "";
  const typeLabel = taskTypeLabels[task.taskType] || "Tâche normale";
  return h(
    "div",
    { className: `task-row ${selected ? "is-selected" : ""}` },
    h(
      "div",
      null,
      h("strong", null, `${task.id} / ${task.title}`),
      h("p", { className: "muted" }, compact ? `${task.departmentName} / ${typeLabel} / ${dueLabel(task.dueDateLabel)}` : `${typeLabel} / ${task.departmentName} / Responsable : ${task.responsibleNames || task.assignedEmployeeName} / Vérificateur : ${task.verifierName || task.supervisorName} / Échéance ${dueLabel(task.dueDateLabel)}${latestNote ? ` / Note : ${latestNote}` : ""}`),
    ),
    h(
      "div",
      { className: "card-meta" },
      h(Pill, { color: statusClass(task.status) }, statusLabel(task.status)),
      !compact && task.priority && h(Pill, { color: priorityClass(task.priority) }, priorityLabel(task.priority)),
      onOpen && h("button", { className: "ghost-button", type: "button", onClick: () => onOpen(task.id) }, "Ouvrir"),
    ),
  );
}

function Filters({ departments, filters, setFilters }) {
  const statuses = ["Ready", "In Progress", "On Hold", "Blocked", "Waiting for Review", "Completed"];
  return h(
    "div",
    { className: "filters" },
    h(
      "select",
      { value: filters.departmentId, onChange: (e) => setFilters((f) => ({ ...f, departmentId: e.target.value })) },
      h("option", { value: "" }, "Tous les départements"),
      departments.map((dept) => h("option", { key: dept.id, value: dept.id }, dept.name)),
    ),
    h(
      "select",
      { value: filters.status, onChange: (e) => setFilters((f) => ({ ...f, status: e.target.value })) },
      h("option", { value: "" }, "Tous les statuts"),
      statuses.map((status) => h("option", { key: status, value: status }, statusLabel(status))),
    ),
  );
}

function Dashboard({ data, tasks, setView, currentUser }) {
  const activeUsers = data.users.filter((user) => user.isActive).length;
  const myNotifications = (data.notifications || []).filter((notification) => notification.userId === currentUser.id).slice(0, 6);
  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: "metrics-grid" },
      h(Metric, { label: "Employés actifs", value: activeUsers, detail: "Dans les départements de l'usine" }),
      h(Metric, { label: "Tâches dues aujourd'hui", value: tasks.length, detail: "Charge de travail globale" }),
      h(Metric, { label: "En cours", value: tasks.filter((task) => task.status === "In Progress").length, detail: "En direct sur les lignes" }),
      h(Metric, { label: "Validations en attente", value: tasks.filter((task) => task.status === "Waiting for Review").length, detail: "File de contrôle qualité" }),
      h(Metric, { label: "Tâches bloquées", value: tasks.filter((task) => task.status === "Blocked").length, detail: "Problème de matière ou de machine" }),
      h(Metric, { label: "Efficacité", value: `${data.kpis?.efficiency || 91}%`, detail: "Objectif : 94%" }),
    ),
    h(
      "div",
      { className: "grid-2" },
      h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Production hebdomadaire"), h(Pill, { color: "green" }, "En direct")), h("div", { className: "chart" }, (data.weeklyProduction || []).map((item) => h("div", { key: item.day, className: "bar", style: { height: `${item.value}%` } }, h("span", null, item.day))))),
      h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Notifications"), h(Pill, { color: "blue" }, `${myNotifications.length}`)), h("div", { className: "activity-list" }, myNotifications.map((item) => h("div", { key: item.id, className: "activity-item" }, h("span", null, item.message), h("span", { className: "muted" }, new Date(item.createdAt).toLocaleDateString("fr-FR")))), myNotifications.length === 0 && h("p", { className: "muted" }, "Aucune notification personnelle."))),
    ),
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Indice de respect d'engagement"), h("button", { className: "ghost-button", type: "button", onClick: () => setView("reports") }, "Voir le détail")), h("div", { className: "dept-grid" }, data.users.filter((user) => roleKey(user.role) === "employee").map((user) => h("div", { key: user.id, className: "dept-card" }, h("strong", null, userFullName(user)), h("p", { className: "muted" }, `${user.departmentName} / ${commitmentIndex(data.tasks, user.id)} jour(s) de retard moyen`))))),
  );
}

function TaskForm({ data, currentUser, onCreate, onCancel, busy }) {
  const [form, setForm] = useState({
    title: "",
    taskType: "normal",
    consolidationType: "normal_send",
    departmentId: data.departments[0]?.id || "",
    responsibleIds: [data.users.find((user) => roleKey(user.role) === "employee")?.id || ""].filter(Boolean),
    verifierId: currentUser.id,
    priority: "",
    estimatedDuration: "1h",
    dueDateLabel: "",
    description: "",
  });
  const requestId = useRef(globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random()}`);
  const submitLock = useRef(false);
  const isDirty = Boolean(form.title || form.description || form.dueDateLabel);
  useUnsavedChanges(isDirty && !busy);
  const activeUsers = data.users.filter((user) => user.isActive !== false);
  const responsibleOptions = form.taskType === "consolidation" && form.consolidationType === "normal_send"
    ? activeUsers
    : activeUsers.filter((user) => roleKey(user.role) === "employee");
  const verifierOptions = activeUsers.filter((user) => roleKey(user.role) === "supervisor");

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleResponsible(userId) {
    setForm((current) => {
      const currentIds = current.responsibleIds || [];
      const nextIds = currentIds.includes(userId) ? currentIds.filter((id) => id !== userId) : [...currentIds, userId];
      return { ...current, responsibleIds: nextIds };
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (submitLock.current || busy) return;
    const responsibleIds = (form.responsibleIds || []).filter(Boolean);
    submitLock.current = true;
    const created = await onCreate({
      ...form,
      responsibleIds,
      assignedEmployeeId: responsibleIds[0],
      supervisorId: form.verifierId,
      clientRequestId: requestId.current,
    });
    submitLock.current = false;
    if (created) onCancel(true);
  }

  function cancel() {
    if (!isDirty || confirm("Abandonner les informations saisies ?")) onCancel(false);
  }

  return h(
    "form",
    { className: "task-form", onSubmit: submit, "aria-busy": busy },
    inputField("Titre", "title", form.title, update, "Ex. Vérifier une anomalie de production", true, "span-2"),
    selectField("Type de tâche", "taskType", form.taskType, update, [["normal", "Tâche normale"], ["consolidation", "Tâche de consolidation"]]),
    form.taskType === "consolidation" && selectField("Sous-type", "consolidationType", form.consolidationType, update, [["normal_send", "Envoi normal"], ["urgent_meeting", "Réunion urgente"]]),
    selectField("Département", "departmentId", form.departmentId, update, data.departments.map((dept) => [dept.id, dept.name])),
    selectField("Vérificateur", "verifierId", form.verifierId, update, verifierOptions.map((user) => [user.id, userFullName(user)])),
    selectField("Priorité optionnelle", "priority", form.priority, update, [["", "Aucune"], ["Low", "Basse"], ["Medium", "Moyenne"], ["High", "Haute"], ["Critical", "Urgente"]]),
    inputField("Date d'échéance", "dueDateLabel", form.dueDateLabel, update, "", true, "", "date"),
    inputField("Durée estimée", "estimatedDuration", form.estimatedDuration, update, "2h 30m"),
    h(
      "fieldset",
      { className: "responsible-picker span-2" },
      h("legend", null, form.taskType === "consolidation" && form.consolidationType === "normal_send" ? "Responsables concernés" : "Responsable"),
      h("div", null, responsibleOptions.map((user) => h("label", { key: user.id }, h("input", { type: "checkbox", checked: (form.responsibleIds || []).includes(user.id), onChange: () => toggleResponsible(user.id) }), h("span", null, userFullName(user))))),
    ),
    h("label", { className: "span-2" }, h("span", null, "Description"), h("textarea", { value: form.description, onChange: (e) => update("description", e.target.value), placeholder: "Contexte, anomalie, perte, consignes ou résultat attendu..." })),
    h("div", { className: "form-actions span-2" }, h("button", { className: "primary-button", type: "submit", disabled: busy }, busy ? "Création..." : "Créer la tâche"), h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: cancel }, "Annuler")),
  );
}

function inputField(label, name, value, update, placeholder = "", required = false, className = "", type = "text") {
  return h("label", { className }, h("span", null, label), h("input", { name, type, value, placeholder, required, min: type === "number" ? 1 : undefined, onChange: (e) => update(name, e.target.value) }));
}

function selectField(label, name, value, update, options) {
  return h("label", null, h("span", null, label), h("select", { name, value, onChange: (e) => update(name, e.target.value), required: true }, options.map(([id, text]) => h("option", { key: id, value: id }, text))));
}

function Tasks({ data, tasks, filters, setFilters, currentUser, onCreateTask, busy }) {
  const [showForm, setShowForm] = useState(false);
  const columns = ["Ready", "In Progress", "Waiting for Review", "Completed"];
  return h(
    React.Fragment,
    null,
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-header" }, h("h2", null, "Tâches"), h("div", { className: "filters" }, h(Filters, { departments: data.departments, filters, setFilters }), roleKey(currentUser.role) === "supervisor" && h("button", { className: "primary-button", type: "button", disabled: busy, onClick: () => setShowForm((value) => !value) }, "+ Nouvelle tâche"))),
      showForm && h(TaskForm, { data, currentUser, busy, onCancel: () => setShowForm(false), onCreate: onCreateTask }),
      h("div", { className: "task-board" }, columns.map((status) => h("section", { key: status, className: "board-column" }, h("h3", null, statusLabel(status)), tasks.filter((task) => task.status === status).map((task) => h(TaskCard, { key: task.id, task })), !tasks.some((task) => task.status === status) && h("p", { className: "muted" }, "Aucune tâche dans cette colonne.")))),
    ),
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Toutes les tâches correspondantes"), h(Pill, { color: "blue" }, `${tasks.length} lignes`)), h("div", { className: "task-list" }, tasks.map((task) => h(TaskRow, { key: task.id, task })))),
  );
}

function TaskCard({ task }) {
  const typeLabel = task.taskType === "consolidation" ? `${taskTypeLabels.consolidation} / ${consolidationLabels[task.consolidationType] || ""}` : "Tâche normale";
  return h("div", { className: "task-card" }, h("div", { className: "card-meta" }, h(Pill, { color: "blue" }, task.id), task.priority && h(Pill, { color: priorityClass(task.priority) }, priorityLabel(task.priority))), h("strong", null, task.title), h("span", { className: "muted" }, `${typeLabel} / ${task.departmentName}`), h("span", { className: "muted" }, `Responsable : ${task.responsibleNames || task.assignedEmployeeName}`), h("span", { className: "muted" }, `Vérificateur : ${task.verifierName || task.supervisorName}`));
}

function Employee({ tasks, notifications = [], activeTaskId, setActiveTaskId, onTaskStatus, busy }) {
  const actionableStatuses = ["In Progress", "Ready", "On Hold", "Blocked", "Waiting for Review", "Pending", "Rejected"];
  const selectedTask = tasks.find((task) => task.id === activeTaskId);
  const selectedIsActionable = selectedTask && actionableStatuses.includes(selectedTask.status);
  const current =
    (selectedIsActionable && selectedTask) ||
    tasks.find((task) => task.status === "In Progress") ||
    tasks.find((task) => task.status === "Ready") ||
    tasks.find((task) => ["On Hold", "Blocked", "Rejected"].includes(task.status)) ||
    tasks.find((task) => task.status === "Waiting for Review") ||
    selectedTask ||
    tasks[0];
  const activeTasks = tasks.filter((task) => actionableStatuses.includes(task.status));
  const finishedTasks = tasks.filter((task) => !actionableStatuses.includes(task.status));

  useEffect(() => {
    if (current) setActiveTaskId(current.id);
  }, [current?.id]);

  if (!current) return h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Aucune tâche assignée"), h(Pill, { color: "blue" }, "Disponible")), h("p", { className: "muted" }, "Aucune tâche n'est actuellement assignée à ce compte employé."));

  return h(
    "section",
    { className: "employee-home", "aria-busy": busy },
    h(
      "div",
      { className: "current-task work-console" },
      h(
        "div",
        { className: "work-console-header" },
        h("div", null, h("p", { className: "eyebrow" }, "Tâche actuelle"), h("h2", null, current.title), h("span", { className: "muted" }, current.description || "Aucune description ajoutée pour cette tâche.")),
        h("div", { className: "work-status" }, h(Pill, { color: statusClass(current.status) }, statusLabel(current.status)), h("small", { className: "muted" }, current.id)),
      ),
      h(
        "div",
        { className: "work-details" },
        h("div", null, h("span", null, "Type"), h("strong", null, current.taskType === "consolidation" ? `${taskTypeLabels.consolidation} / ${consolidationLabels[current.consolidationType] || ""}` : "Tâche normale")),
        h("div", null, h("span", null, "Département"), h("strong", null, current.departmentName)),
        h("div", null, h("span", null, "Responsable"), h("strong", null, current.responsibleNames || current.assignedEmployeeName)),
        h("div", null, h("span", null, "Vérificateur"), h("strong", null, current.verifierName || current.supervisorName)),
      ),
      h(
        "div",
        { className: "work-metrics" },
        h(Metric, { label: "Priorité", value: current.priority ? priorityLabel(current.priority) : "Aucune", detail: "Champ optionnel" }),
        h(Metric, { label: "Retard KPI", value: `${taskDelayDays(current)} j`, detail: "Indice d'engagement" }),
        h(Metric, { label: "Échéance", value: dueLabel(current.dueDateLabel), detail: current.estimatedDuration }),
      ),
      h(
        "div",
        { className: "work-actions-panel" },
        h("div", null, h("h3", null, "Actions de production"), h("p", { className: "muted" }, employeeActionText(current.status))),
        h("div", { className: "action-grid" }, employeeButtons(current, onTaskStatus, () => setActiveTaskId(activeTasks[0]?.id || tasks[0]?.id), busy)),
      ),
    ),
    h("aside", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Mes tâches"), h(Pill, { color: "blue" }, `${activeTasks.length} actives`)), notifications.length > 0 && h("div", { className: "employee-history" }, h("h3", null, "Notifications"), h("div", { className: "activity-list" }, notifications.slice(0, 4).map((item) => h("div", { key: item.id, className: "activity-item" }, h("span", null, item.message), h("span", { className: "muted" }, new Date(item.createdAt).toLocaleDateString("fr-FR")))))), h("div", { className: "task-list" }, activeTasks.map((task) => h(TaskRow, { key: task.id, task, compact: true, selected: task.id === current.id, onOpen: setActiveTaskId })), activeTasks.length === 0 && h("p", { className: "muted" }, "Aucune tâche active pour le moment.")), finishedTasks.length > 0 && h("div", { className: "employee-history" }, h("h3", null, "Terminées"), h("div", { className: "task-list" }, finishedTasks.slice(0, 5).map((task) => h(TaskRow, { key: task.id, task, compact: true, selected: task.id === current.id, onOpen: setActiveTaskId }))))),
  );
}

function employeeActionText(status) {
  if (status === "Ready" || status === "Pending") return "Démarrez la tâche lorsque vous acceptez l'échéance proposée.";
  if (status === "In Progress") return "Clôturez la tâche réalisée ou demandez un changement de date au créateur.";
  if (status === "On Hold") return "La tâche est en pause. Reprenez-la lorsque vous pouvez continuer.";
  if (status === "Blocked" || status === "Rejected") return "Ajoutez une note ou reprenez après correction du problème.";
  if (status === "Waiting for Review") return "La tâche attend la vérification du vérificateur désigné. Vous pouvez ajouter une note.";
  return "Consultez l'état de cette tâche et passez à une tâche active si nécessaire.";
}

function employeeButtons(task, onTaskStatus, openNextTask, busy) {
  const buttons = [];
  const add = (label, action, primary = false) => buttons.push(h("button", { key: action, className: primary ? "primary-button" : "ghost-button", type: "button", disabled: busy, onClick: () => onTaskStatus(task, action) }, label));
  if (task.status === "Approved") return h("div", { className: "employee-state-message" }, h("strong", null, "Tâche terminée"), h("span", { className: "muted" }, "Le vérificateur a validé ce travail."), h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: openNextTask }, "Voir une tâche active"));
  if (task.status === "Completed") return h("div", { className: "employee-state-message" }, h("strong", null, "Tâche terminée"), h("span", { className: "muted" }, "Cette tâche est archivée dans votre historique."), h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: openNextTask }, "Voir une tâche active"));
  if (task.status === "Cancelled") return h("div", { className: "employee-state-message" }, h("strong", null, "Tâche annulée"), h("span", { className: "muted" }, "Aucune intervention n'est nécessaire sur cette tâche."), h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: openNextTask }, "Voir une tâche active"));
  if (task.status === "Waiting for Review") {
    add("Ajouter une note", "note");
    buttons.push(h("span", { key: "review-info", className: "employee-state-message muted" }, "Envoyée au vérificateur pour validation."));
  }
  else if (task.status === "In Progress") {
    add("Clôturer", "complete", true);
    add("Demander une nouvelle date", "dateChange");
    add("Ajouter une note", "note");
  } else if (["Blocked", "On Hold"].includes(task.status)) {
    add("Reprendre", "resume", true);
    add("Ajouter une note", "note");
  } else {
    add("Démarrer", "start", true);
    add("Signaler un problème", "problem");
    add("Ajouter une note", "note");
  }
  return buttons;
}

function Supervisor({ data, tasks, filters, setFilters, currentUser, onReview, onUpdateTask, onDeleteTask, busy }) {
  const waiting = tasks.filter((task) => task.status === "Waiting for Review");
  const teamUsers = data.users.filter((user) => roleKey(user.role) === "employee").filter((user) => user.departmentId === currentUser.departmentId);
  return h(
    React.Fragment,
    null,
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Filtres supervision"), h(Filters, { departments: data.departments, filters, setFilters }))),
    h("div", { className: "metrics-grid" }, h(Metric, { label: "Tâches visibles", value: tasks.length, detail: "Département + vérifications" }), h(Metric, { label: "À vérifier par moi", value: waiting.filter((task) => (task.verifierId || task.supervisorId) === currentUser.id).length, detail: "Validation autorisée" }), h(Metric, { label: "Indice d'engagement", value: `${commitmentIndex(tasks, currentUser.id)} j`, detail: "Retard moyen par tâche" }), h(Metric, { label: "Demandes de date", value: tasks.filter((task) => task.dueDateChangeRequest).length, detail: "À traiter par le créateur" })),
    h(
      "div",
      { className: "grid-2" },
      h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "En attente de vérification"), h(Pill, { color: "amber" }, "Vérificateur désigné")), h("div", { className: "task-list" }, waiting.map((task) => {
        const canVerify = (task.verifierId || task.supervisorId) === currentUser.id;
        return h("div", { key: task.id, className: "task-row" }, h("div", null, h("strong", null, `${task.id} / ${task.title}`), h("p", { className: "muted" }, `${task.departmentName} / Responsable : ${task.responsibleNames || task.assignedEmployeeName} / Vérificateur : ${task.verifierName || task.supervisorName}`)), h("div", { className: "card-meta" }, canVerify ? h("button", { className: "primary-button", type: "button", disabled: busy, onClick: () => onReview(task, true) }, "Valider") : h(Pill, { color: "amber" }, "Lecture seule"), canVerify && h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: () => onReview(task, false) }, "Refuser")));
      }), waiting.length === 0 && h("p", { className: "muted" }, "Aucune tâche en attente."))),
      h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Charge des employés"), h(Pill, { color: "green" }, "Équilibrée")), h("div", { className: "report-list" }, teamUsers.map((user) => h("div", { key: user.id, className: "report-row" }, h("span", null, h("strong", null, userFullName(user)), h("br"), h("small", { className: "muted" }, user.departmentName)), h("strong", null, `${user.load}%`))))),
    ),
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-header" }, h("h2", null, "Gestion des tâches du département"), h(Pill, { color: "blue" }, "Manager")),
      h(
        "div",
        { className: "task-list" },
        tasks.map((task) =>
          h(
            "div",
            { key: task.id, className: "task-row" },
            h("div", null, h("strong", null, `${task.id} / ${task.title}`), h("p", { className: "muted" }, `${statusLabel(task.status)} / ${task.responsibleNames || task.assignedEmployeeName} / Échéance : ${dueLabel(task.dueDateLabel)}${task.dueDateChangeRequest ? ` / Demande : ${task.dueDateChangeRequest}` : ""}`)),
            h(
              "div",
              { className: "card-meta" },
              h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: () => {
                const dueDateLabel = prompt("Nouvelle date d'échéance (AAAA-MM-JJ) :", task.dueDateLabel || "");
                if (dueDateLabel) onUpdateTask(task.id, { dueDateLabel, dueDateChangeRequest: "" });
              } }, "Modifier date"),
              h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: () => {
                const employeeId = prompt("ID du nouveau responsable :", task.assignedEmployeeId || "");
                if (employeeId) onUpdateTask(task.id, { assignedEmployeeId: employeeId, responsibleIds: [employeeId] });
              } }, "Réaffecter"),
              h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: () => onDeleteTask(task) }, "Supprimer"),
            ),
          ),
        ),
      ),
    ),
  );
}

function userInitials(user) {
  return `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "RB";
}

function Users({ data, search, onCreateUser, onUpdateUser, busy }) {
  const [showForm, setShowForm] = useState(false);
  const initialForm = { firstName: "", lastName: "", email: "", phone: "", role: "Employé", departmentId: data.departments[0]?.id || "", temporaryPassword: "" };
  const [form, setForm] = useState(initialForm);
  const query = search.toLowerCase();
  const rows = query ? data.users.filter((user) => `${userFullName(user)} ${user.email} ${user.role} ${user.departmentName}`.toLowerCase().includes(query)) : data.users;
  const activeCount = rows.filter((user) => user.isActive).length;
  const supervisorCount = rows.filter((user) => roleKey(user.role) === "supervisor").length;
  const employeeCount = rows.length - supervisorCount;
  const isDirty = Boolean(form.firstName || form.lastName || form.email || form.phone || form.temporaryPassword);
  useUnsavedChanges(showForm && isDirty && !busy);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const created = await onCreateUser(form);
    if (created) {
      setForm(initialForm);
      setShowForm(false);
    }
  }

  function closeForm() {
    if (!isDirty || confirm("Abandonner les informations saisies ?")) setShowForm(false);
  }

  return h(
    "article",
    { className: "panel users-panel" },
    h(
      "div",
      { className: "panel-header" },
      h("div", null, h("h2", null, "Utilisateurs de l'usine"), h("p", { className: "muted" }, "Vue organisée des vérificateurs et des responsables actifs.")),
      h("button", { className: "primary-button", type: "button", disabled: busy, onClick: () => setShowForm((value) => !value) }, "+ Créer un utilisateur"),
    ),
    h(
      "div",
      { className: "user-summary" },
      h(Metric, { label: "Utilisateurs affichés", value: rows.length, detail: "Selon la recherche" }),
      h(Metric, { label: "Actifs", value: activeCount, detail: "Comptes disponibles" }),
      h(Metric, { label: "Vérificateurs", value: supervisorCount, detail: "Création et validation" }),
      h(Metric, { label: "Responsables", value: employeeCount, detail: "Exécution des tâches" }),
    ),
    showForm &&
      h("form", { className: "task-form", onSubmit: submit, "aria-busy": busy }, inputField("Prénom", "firstName", form.firstName, update, "", true), inputField("Nom", "lastName", form.lastName, update, "", true), inputField("Email", "email", form.email, update, "prenom@richbond.local", true, "", "email"), inputField("Téléphone", "phone", form.phone, update), selectField("Rôle", "role", form.role, update, [["Employé", "Responsable"], ["Superviseur", "Vérificateur"]]), selectField("Département", "departmentId", form.departmentId, update, data.departments.map((dept) => [dept.id, dept.name])), inputField("Mot de passe temporaire", "temporaryPassword", form.temporaryPassword, update, "10 caractères minimum", true, "span-2", "password"), h("p", { className: "password-rules muted span-2" }, "Le nouvel utilisateur devra le remplacer à sa première connexion."), h("div", { className: "form-actions span-2" }, h("button", { className: "primary-button", type: "submit", disabled: busy }, busy ? "Création..." : "Créer l'utilisateur"), h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: closeForm }, "Annuler"))),
    h(
      "div",
      { className: "user-grid" },
      rows.map((user) =>
        h(
          "div",
          { key: user.id, className: "user-card" },
          h(
            "div",
            { className: "user-card-header" },
            h("div", { className: "user-avatar", "aria-hidden": true }, userInitials(user)),
            h("div", { className: "user-identity" }, h("h3", null, userFullName(user)), h("span", null, user.email)),
            h(Pill, { color: user.isActive ? "green" : "amber" }, user.isActive ? "Actif" : "Inactif"),
          ),
          h(
            "div",
            { className: "user-details" },
            h("div", null, h("span", null, "Rôle"), h("strong", null, roleKey(user.role) === "supervisor" ? "Vérificateur" : "Responsable")),
            h("div", null, h("span", null, "Département"), h("strong", null, user.departmentName || "Non affecté")),
            h("div", null, h("span", null, "Téléphone"), h("strong", null, user.phone || "Non renseigné")),
            h("div", null, h("span", null, "Charge"), h("strong", null, `${Number(user.load || 0)}%`)),
          ),
          h("div", { className: "user-actions" }, h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: () => onUpdateUser(user.id, { isActive: !user.isActive }) }, user.isActive ? "Désactiver" : "Activer")),
        ),
      ),
      rows.length === 0 && h("p", { className: "muted" }, "Aucun utilisateur ne correspond à la recherche."),
    ),
  );
}

function Settings({ data, onCreateDepartment, busy }) {
  const [form, setForm] = useState({ name: "", description: "", capacity: 50 });
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const isDirty = Boolean(form.name || form.description);
  useUnsavedChanges(isDirty && !busy);

  async function submit(event) {
    event.preventDefault();
    if (await onCreateDepartment(form)) setForm({ name: "", description: "", capacity: 50 });
  }

  return h(
    "div",
    { className: "grid-2" },
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Départements"), h(Pill, { color: "blue" }, `${data.departments.length} départements`)), h("form", { className: "department-form", onSubmit: submit, "aria-busy": busy }, inputField("Nom", "name", form.name, update, "Ex. Ressorts", true), inputField("Description", "description", form.description, update, "Description du département"), inputField("Capacité", "capacity", form.capacity, update, "", false, "", "number"), h("button", { className: "primary-button", type: "submit", disabled: busy }, busy ? "Ajout..." : "+ Ajouter")), h("div", { className: "dept-grid" }, data.departments.map((dept) => h("div", { key: dept.id, className: "dept-card" }, h("strong", null, dept.name), h("p", { className: "muted" }, dept.description))))),
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Sécurité"), h(Pill, { color: "green" }, "Contrôles actifs")), h("div", { className: "report-list" }, ["Sessions authentifiées", "Autorisations par rôle", "Protection de la connexion", "Journal d'audit"].map((item) => h("div", { key: item, className: "report-row" }, h("span", null, item), h(Pill, { color: "green" }, "Actif"))))),
  );
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function downloadExcelReport(filename, html) {
  const workbook = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #172033; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #cfd8e3; padding: 8px; vertical-align: top; }
          th { background: #082985; color: #ffffff; font-weight: 700; }
          .title { background: #082985; color: #ffffff; font-size: 22px; font-weight: 700; }
          .section { background: #eaf2ff; color: #082985; font-weight: 700; }
          .label { background: #f3f6fb; font-weight: 700; width: 180px; }
          .metric { background: #f8fbff; font-size: 18px; font-weight: 700; text-align: center; }
          .muted { color: #607089; font-size: 12px; }
          .status-approved { background: #dff7e8; }
          .status-review { background: #fff3cd; }
          .status-blocked { background: #fde2e8; }
        </style>
      </head>
      <body>${html}</body>
    </html>`;
  const blob = new Blob([`\ufeff${workbook}`], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Reports({ data }) {
  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const value = new Date(today);
    value.setDate(value.getDate() - 7);
    return value;
  }, [today]);
  const [reportFilters, setReportFilters] = useState({
    startDate: toDateInputValue(lastWeek),
    endDate: toDateInputValue(today),
    departmentId: "",
    reportType: "tasks",
  });

  function update(name, value) {
    setReportFilters((current) => ({ ...current, [name]: value }));
  }

  const filteredTasks = filterTasksForReport(data.tasks, reportFilters);
  const reportSummary = summarizeReport(filteredTasks);
  const kpiUsers = data.users
    .filter((user) => roleKey(user.role) === "employee")
    .filter((user) => filteredTasks.some((task) => taskResponsibleIds(task).includes(user.id)));

  function exportReport() {
    const html = buildProductionReportHtml({
      tasks: filteredTasks,
      filters: reportFilters,
      departments: data.departments,
      formatters: { status: statusLabel, priority: priorityLabel, due: dueLabel },
      generatedAt: new Date().toLocaleString("fr-FR"),
    });

    downloadExcelReport(`rapport-richbond-${reportFilters.startDate || "debut"}-${reportFilters.endDate || "fin"}.xls`, html);
  }

  return h(
    React.Fragment,
    null,
    h(
      "article",
      { className: "panel reports-panel" },
      h(
        "div",
        { className: "panel-header report-header" },
        h("div", null, h("h2", null, "Tableau de bord des engagements"), h("p", { className: "muted" }, "L'export n'est plus nécessaire pour le suivi principal : le KPI est consultable directement ici.")),
        h("button", { className: "ghost-button", type: "button", onClick: exportReport, disabled: filteredTasks.length === 0 }, `Export optionnel (${filteredTasks.length})`),
      ),
      h(
        "div",
        { className: "report-controls" },
        h("label", null, h("span", null, "Date de début"), h("input", { type: "date", value: reportFilters.startDate, onChange: (e) => update("startDate", e.target.value) })),
        h("label", null, h("span", null, "Date de fin"), h("input", { type: "date", value: reportFilters.endDate, onChange: (e) => update("endDate", e.target.value) })),
        h("label", null, h("span", null, "Département"), h("select", { value: reportFilters.departmentId, onChange: (e) => update("departmentId", e.target.value) }, h("option", { value: "" }, "Tous les départements"), data.departments.map((dept) => h("option", { key: dept.id, value: dept.id }, dept.name)))),
        h("label", null, h("span", null, "Type de rapport"), h("select", { value: reportFilters.reportType, onChange: (e) => update("reportType", e.target.value) }, h("option", { value: "tasks" }, "Tâches de production"))),
      ),
    ),
    h("div", { className: "metrics-grid" }, h(Metric, { label: "Tâches exportées", value: reportSummary.total, detail: "Selon les filtres" }), h(Metric, { label: "Terminées", value: reportSummary.completed, detail: "Approuvées ou terminées" }), h(Metric, { label: "En validation", value: reportSummary.review, detail: "Attente du vérificateur" }), h(Metric, { label: "Bloquées", value: reportSummary.blocked, detail: "Action nécessaire" })),
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-header" }, h("h2", null, "Indice de respect d'engagement"), h(Pill, { color: "blue" }, "Jours de retard / tâches")),
      h("div", { className: "report-list" }, kpiUsers.map((user) => h("div", { key: user.id, className: "report-row" }, h("span", null, h("strong", null, userFullName(user)), h("br"), h("small", { className: "muted" }, user.departmentName)), h("strong", null, `${commitmentIndex(filteredTasks, user.id)} j`))), kpiUsers.length === 0 && h("p", { className: "muted" }, "Aucune donnée KPI pour ces filtres.")),
    ),
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-header" }, h("h2", null, "Rapports disponibles"), h(Pill, { color: "blue" }, `${data.reports.length} modèles`)),
      h("div", { className: "report-list" }, data.reports.map((report) => h("div", { key: report.id, className: "report-row" }, h("span", null, h("strong", null, report.name), h("br"), h("small", { className: "muted" }, report.description)), h(Pill, { color: report.status === "Ready" ? "green" : "amber" }, statusLabel(report.status))))),
    ),
  );
}

export function App() {
  const [session, setSession] = useState(() => loadSession());
  const currentUser = session?.user || null;
  const [data, setData] = useState(emptyData);
  const [view, setView] = useState(() => currentUser && roleKey(currentUser.role || currentUser.roleKey) === "employee" ? "employee" : "dashboard");
  const [theme, setTheme] = useState(() => localStorage.getItem("richbond-theme") || "dark");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ departmentId: "", status: "" });
  const [activeTaskId, setActiveTaskId] = useState("");
  const [loading, setLoading] = useState(Boolean(currentUser && !currentUser.requiresPasswordChange));
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const mutationLock = useRef(false);
  const previousOnline = useRef(online);
  const currentRole = roleKey(currentUser?.role || currentUser?.roleKey);
  const busy = Boolean(pendingAction);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("richbond-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!session || currentUser?.requiresPasswordChange) {
      setLoading(false);
      return;
    }
    refresh({ showLoading: true }).catch(() => undefined);
  }, [session?.token, currentUser?.requiresPasswordChange]);

  useEffect(() => {
    const reconnected = online && previousOnline.current === false;
    previousOnline.current = online;
    if (reconnected && session && !currentUser?.requiresPasswordChange) refresh().catch(() => undefined);
  }, [online]);

  function endSession(message = "") {
    clearSession();
    setSession(null);
    setData(emptyData);
    setView("dashboard");
    setSearch("");
    setFilters({ departmentId: "", status: "" });
    setErrorMessage("");
    setNotice("");
    setLoginMessage(message);
  }

  async function request(path, options = {}) {
    try {
      return await apiClient.request(path, { ...options, token: options.token ?? session?.token });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && session) {
        endSession("Votre session a expiré. Connectez-vous de nouveau.");
      } else if (error instanceof ApiError && error.code === "PASSWORD_CHANGE_REQUIRED" && session) {
        const nextSession = { ...session, user: { ...session.user, requiresPasswordChange: true } };
        saveSession(nextSession);
        setSession(nextSession);
      }
      throw error;
    }
  }

  async function refresh({ showLoading = false } = {}) {
    if (!session?.token) return false;
    if (showLoading) setLoading(true);
    try {
      const nextData = await request("/api/bootstrap");
      setData(nextData);
      setErrorMessage("");
      return true;
    } catch (error) {
      setErrorMessage(error?.message || "Les données n'ont pas pu être chargées.");
      throw error;
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function login(email, password) {
    const result = await apiClient.request("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
    const normalizedUser = { ...result.user, roleKey: roleKey(result.user.role || result.user.roleKey) };
    const nextSession = { token: result.token, expiresAt: result.expiresAt, user: normalizedUser };
    saveSession(nextSession);
    setSession(nextSession);
    setLoginMessage("");
    setErrorMessage("");
    setView(roleKey(normalizedUser.role) === "employee" ? "employee" : "dashboard");
  }

  async function changePassword(currentPassword, newPassword) {
    const result = await request("/api/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const nextSession = { ...session, user: { ...result.user, roleKey: roleKey(result.user.role || result.user.roleKey) } };
    saveSession(nextSession);
    setSession(nextSession);
    setNotice("Votre mot de passe a été enregistré.");
  }

  async function logout() {
    const token = session?.token;
    try {
      if (token) await apiClient.request("/api/logout", { method: "POST", token });
    } catch {
      // The local session must still be removed when the server is unreachable.
    } finally {
      endSession();
    }
  }

  async function runMutation(actionLabel, successMessage, operation) {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setPendingAction(actionLabel);
    setErrorMessage("");
    setNotice("");
    try {
      await operation();
      setNotice(successMessage);
      try {
        await refresh();
      } catch {
        // The mutation succeeded; the retry banner will refresh the stale view.
      }
      return true;
    } catch (error) {
      setErrorMessage(error?.message || "L'opération n'a pas pu être effectuée.");
      return false;
    } finally {
      mutationLock.current = false;
      setPendingAction("");
    }
  }

  const scopedTasks = useMemo(() => {
    if (!currentUser) return [];
    return data.tasks
      .filter((task) => !filters.departmentId || task.departmentId === filters.departmentId)
      .filter((task) => !filters.status || task.status === filters.status)
      .filter((task) => !search || Object.values(task).join(" ").toLowerCase().includes(search.toLowerCase()));
  }, [data.tasks, currentUser, filters, search]);

  async function createTask(payload) {
    return runMutation("Création de la tâche", "La tâche a été créée et affectée.", () => request("/api/tasks", { method: "POST", body: JSON.stringify(payload) }));
  }

  async function createUser(payload) {
    return runMutation("Création de l'utilisateur", "L'utilisateur a été créé.", () => request("/api/users", { method: "POST", body: JSON.stringify(payload) }));
  }

  async function updateUser(id, patch) {
    return runMutation("Mise à jour de l'utilisateur", "Le compte utilisateur a été mis à jour.", () => request(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }));
  }

  async function createDepartment(payload) {
    return runMutation("Création du département", "Le département a été ajouté.", () => request("/api/departments", { method: "POST", body: JSON.stringify(payload) }));
  }

  async function updateTaskById(id, patch) {
    return runMutation("Mise à jour de la tâche", "La tâche a été mise à jour.", () => request(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }));
  }

  async function deleteTask(task) {
    if (!confirm(`Supprimer définitivement la tâche ${task.id} ?`)) return false;
    return runMutation("Suppression de la tâche", "La tâche a été supprimée.", () => request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" }));
  }

  async function updateTask(task, action) {
    const statusByAction = { start: "In Progress", resume: "In Progress", pause: "On Hold", complete: "Waiting for Review", problem: "Blocked", note: task.status };
    let payload;
    if (action === "dateChange") {
      const dueDateChangeRequest = prompt("Expliquez la demande de changement de date :") || "";
      if (!dueDateChangeRequest) return false;
      payload = { status: task.status, dueDateChangeRequest };
    } else {
      let note = "";
      if (action === "problem") note = prompt("Décrivez le problème rencontré :") || "Problème signalé par le responsable.";
      if (action === "note") {
        note = prompt("Ajouter une note :") || "";
        if (!note) return false;
      }
      payload = { status: statusByAction[action], note };
    }
    setActiveTaskId(task.id);
    return runMutation("Mise à jour de la tâche", "L'action a été enregistrée.", () => request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify(payload) }));
  }

  async function reviewTask(task, approved) {
    const note = approved ? "Travail validé par le vérificateur." : prompt("Motif du refus (optionnel) :") || "Tâche refusée par le vérificateur.";
    return runMutation(approved ? "Validation de la tâche" : "Refus de la tâche", approved ? "La tâche a été validée." : "La tâche a été renvoyée au responsable.", () => request(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: approved ? "Completed" : "In Progress", note }),
    }));
  }

  if (!currentUser) return h(Login, { onLogin: login, initialMessage: loginMessage });
  if (currentUser.requiresPasswordChange) return h(PasswordChange, { user: currentUser, onChangePassword: changePassword, onLogout: logout });

  const allowedNav = navItems.filter((item) => item.roles.includes(currentRole));

  const pageTitle = navItems.find((item) => item.id === view)?.label || "Tableau de bord";

  let content;
  if (view === "dashboard") content = h(Dashboard, { data, tasks: scopedTasks, setView, currentUser });
  if (view === "tasks") content = h(Tasks, { data, tasks: scopedTasks, filters, setFilters, currentUser, onCreateTask: createTask, busy });
  if (view === "employee") content = h(Employee, { tasks: scopedTasks, notifications: data.notifications || [], activeTaskId, setActiveTaskId, onTaskStatus: updateTask, busy });
  if (view === "supervisor") content = h(Supervisor, { data, tasks: scopedTasks, filters, setFilters, currentUser, onReview: reviewTask, onUpdateTask: updateTaskById, onDeleteTask: deleteTask, busy });
  if (view === "reports") content = h(Reports, { data: { ...data, tasks: scopedTasks } });
  if (view === "users") content = h(Users, { data, search, onCreateUser: createUser, onUpdateUser: updateUser, busy });
  if (view === "settings") content = h(Settings, { data, onCreateDepartment: createDepartment, busy });

  return h(
    "div",
    { className: "app-shell" },
    h(
      "aside",
      { className: "sidebar", "aria-label": "Navigation principale" },
      h(Brand),
      h("div", { className: "nav-caption" }, "ESPACE DE TRAVAIL"),
      h("nav", { className: "nav-list" }, allowedNav.map((item) => h("button", { key: item.id, className: `nav-button ${view === item.id ? "active" : ""}`, type: "button", onClick: () => setView(item.id) }, h("span", { className: "nav-icon" }, h(Icon, { name: item.icon })), h("strong", null, item.label), h(Icon, { name: "chevron-right", size: 16 })))),
      h("div", { className: "factory-pulse" }, h("span", { className: "pulse-dot" }), h("div", null, h("strong", null, "Production connectée"), h("span", null, "Synchronisation en temps réel"))),
    ),
    h(
      "main",
      { className: "main", "aria-busy": loading || busy },
      h(
        "header",
        { className: "topbar" },
        h("div", { className: "page-heading" }, h("p", { className: "eyebrow" }, currentRole === "supervisor" ? "Centre de pilotage" : "Espace responsable"), h("h1", null, pageTitle)),
        h(
          "div",
          { className: "topbar-actions" },
          h("label", { className: "search" }, h(Icon, { name: "search", size: 19 }), h("input", { type: "search", value: search, placeholder: "Rechercher une tâche, un lot, une personne...", onChange: (e) => { setSearch(e.target.value); if (e.target.value && !["tasks", "supervisor", "employee", "users"].includes(view)) setView(currentRole === "employee" ? "employee" : "tasks"); } })),
          h("div", { className: "user-chip" }, h("span", { className: "user-chip-avatar" }, userInitials(currentUser)), h("span", { className: "user-chip-copy" }, h("strong", null, userFullName(currentUser)), h("small", null, currentRole === "supervisor" ? "Vérificateur" : "Responsable"))),
          h("button", { className: "icon-button theme-button", type: "button", title: "Changer le thème", "aria-label": "Changer le thème", onClick: () => setTheme((value) => (value === "dark" ? "light" : "dark")) }, h(Icon, { name: theme === "dark" ? "sun" : "moon" })),
          h("button", { className: "icon-button logout-button", type: "button", title: "Se déconnecter", "aria-label": "Se déconnecter", onClick: logout }, h(Icon, { name: "log-out" })),
        ),
      ),
      !online && h(StatusBanner, { kind: "offline", message: "Vous êtes hors connexion. Les données affichées peuvent être anciennes." }),
      errorMessage && h(StatusBanner, { kind: "error", message: errorMessage, onRetry: () => refresh({ showLoading: true }).catch(() => undefined), onClose: () => setErrorMessage("") }),
      notice && h(StatusBanner, { kind: "success", message: notice, onClose: () => setNotice("") }),
      pendingAction && h(StatusBanner, { kind: "info", message: `${pendingAction} en cours...` }),
      h(
        "section",
        { className: "hero-status", "aria-label": "État de l'usine" },
        h("div", { className: "hero-copy" }, h("span", { className: "live-label" }, h("span", { className: "pulse-dot" }), "ACTIVITÉ EN DIRECT"), h("strong", null, "La production reste stable"), h("p", null, "Les indicateurs clés et les validations sont synchronisés.")),
        h("div", { className: "hero-metrics" }, h("span", null, h("small", null, "Efficacité"), h("b", null, `${data.kpis?.efficiency || 91}%`)), h("span", null, h("small", null, "Départements"), h("b", null, data.departments.length || 0)), h("span", null, h("small", null, "À valider"), h("b", null, data.tasks.filter((task) => task.status === "Waiting for Review").length))),
      ),
      h("section", { className: "view" }, loading ? h(LoadingState) : content),
    ),
  );
}

const rootElement = document.getElementById("root");
if (rootElement) createRoot(rootElement).render(h(App));
