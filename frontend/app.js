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
  X,
} from "lucide";
import { ApiError, createApiClient } from "./apiClient.js";
import richbondLogoUrl from "./assets/richbond-logo-white.png";
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
  x: X,
};

const emptyData = { departments: [], users: [], tasks: [], activities: [], notifications: [], reports: [], weeklyProduction: [], kpis: {} };

const navItems = [
  { id: "dashboard", label: "Tableau de bord", icon: "layout-dashboard", roles: ["combined", "admin"] },
  { id: "tasks", label: "Tâches", icon: "panels-top-left", roles: ["combined", "admin"] },
  { id: "todo", label: "À faire", icon: "clipboard-check", roles: ["combined"] },
  { id: "supervisor", label: "Supervision", icon: "shield-check", roles: ["combined", "admin"] },
  { id: "users", label: "Utilisateurs", icon: "users", roles: ["admin"] },
  { id: "reports", label: "Rapports", icon: "chart-no-axes-combined", roles: ["admin"] },
  { id: "settings", label: "Paramètres", icon: "settings-2", roles: ["combined", "admin"] },
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
  Rejected: "Rejetée",
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
  const normalized = String(role || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("admin")) return "admin";
  if (["verif", "responsable", "super", "employ", "combined"].some((marker) => normalized.includes(marker))) return "combined";
  return "unknown";
}

function roleLabel(user) {
  return roleKey(user?.role || user?.roleKey) === "admin" ? "Administrateur" : "Vérificateur/Responsable";
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

function isTaskRelatedToUser(task, userId) {
  return task.createdBy === userId
    || (task.verifierId || task.supervisorId) === userId
    || taskResponsibleIds(task).includes(userId);
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

function Metric({ label, value }) {
  return h(
    "article",
    { className: "metric-card" },
    h("div", { className: "metric-topline" }, h("small", null, label), h("span", { className: "metric-signal", "aria-hidden": true })),
    h("strong", null, value),
  );
}

function Brand({ login = false }) {
  return h(
    "div",
    { className: `brand ${login ? "login-brand" : ""}` },
    h(RichbondLogo),
  );
}

function WorkspaceTools({
  className = "",
  currentUser,
  theme,
  onThemeToggle,
  onLogout,
}) {
  return h(
    "div",
    { className: `topbar-actions ${className}`.trim() },
    h(
      "div",
      { className: "user-chip" },
      h("span", { className: "user-chip-avatar" }, userInitials(currentUser)),
      h(
        "span",
        { className: "user-chip-copy" },
        h("strong", null, userFullName(currentUser)),
        h("small", null, roleLabel(currentUser)),
      ),
    ),
    h(
      "button",
      {
        className: "icon-button theme-button",
        type: "button",
        title: "Changer le thème",
        "aria-label": "Changer le thème",
        onClick: onThemeToggle,
      },
      h(Icon, { name: theme === "dark" ? "sun" : "moon" }),
    ),
    h(
      "button",
      {
        className: "icon-button logout-button",
        type: "button",
        title: "Se déconnecter",
        "aria-label": "Se déconnecter",
        onClick: onLogout,
      },
      h(Icon, { name: "log-out" }),
    ),
  );
}

function AdminScopeBar({ departments, search, setSearch, departmentId, setDepartmentId }) {
  const hasFilters = Boolean(search || departmentId);
  return h(
    "section",
    { className: "admin-scope-bar", "aria-label": "Recherche et filtres administrateur" },
    h(
      "label",
      { className: "admin-search" },
      h(Icon, { name: "search", size: 18 }),
      h("input", {
        type: "search",
        value: search,
        placeholder: "Rechercher une tâche, un utilisateur ou un statut",
        "aria-label": "Rechercher",
        onChange: (event) => setSearch(event.target.value),
      }),
    ),
    h(
      "label",
      { className: "admin-department" },
      h("span", null, "Département"),
      h(
        "select",
        { value: departmentId, "aria-label": "Filtrer par département", onChange: (event) => setDepartmentId(event.target.value) },
        h("option", { value: "" }, "Tous les départements"),
        departments.map((department) => h("option", { key: department.id, value: department.id }, department.name)),
      ),
    ),
    h(
      "button",
      {
        className: "icon-button admin-reset",
        type: "button",
        disabled: !hasFilters,
        title: "Réinitialiser les filtres",
        "aria-label": "Réinitialiser les filtres",
        onClick: () => {
          setSearch("");
          setDepartmentId("");
        },
      },
      h(Icon, { name: "x" }),
    ),
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
          h("p", null, "Une vision claire des tâches, des engagements et des vérifications de votre usine."),
        ),
        h(
          "div",
          { className: "login-stats" },
          h("div", null, h("strong", null, "Temps réel"), h("span", null, "Suivi de production")),
          h("div", null, h("strong", null, "2 rôles"), h("span", null, "Accès séparés")),
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

function TaskRow({ task, compact = false, selected = false, onOpen, showCreator = false }) {
  const latestNote = Array.isArray(task.notes) && task.notes[0] ? task.notes[0].message : "";
  const typeLabel = taskTypeLabels[task.taskType] || "Tâche normale";
  const fullDetails = [
    typeLabel,
    task.departmentName,
    showCreator ? `Créée par : ${task.creatorName || "Non affecté"}` : "",
    `Responsable : ${task.responsibleNames || task.assignedEmployeeName}`,
    `Vérificateur : ${task.verifierName || task.supervisorName}`,
    `Échéance : ${dueLabel(task.dueDateLabel)}`,
    latestNote ? `Note : ${latestNote}` : "",
  ].filter(Boolean).join(" / ");
  return h(
    "div",
    { className: `task-row ${selected ? "is-selected" : ""}` },
    h(
      "div",
      null,
      h("strong", null, `${task.id} / ${task.title}`),
      h("p", { className: "muted" }, compact ? `${task.departmentName} / ${typeLabel} / ${dueLabel(task.dueDateLabel)}` : fullDetails),
      task.rejectionReason && h("p", { className: "task-rejection-summary" }, h("strong", null, "Motif du rejet : "), task.rejectionReason),
      showCreator && task.description && h("p", { className: "task-description" }, task.description),
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

function Filters({ departments, filters, setFilters, showDepartment = true }) {
  const statuses = ["Ready", "In Progress", "On Hold", "Blocked", "Waiting for Review", "Completed"];
  return h(
    "div",
    { className: "filters" },
    showDepartment && h(
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

function Dashboard({ data, tasks, commitmentTasks, currentUser, isAdmin = false, departmentId = "" }) {
  const activeUsers = data.users.filter((user) => user.isActive).length;
  const monitoredUsers = data.users.filter((user) => user.isActive !== false && roleKey(user.role || user.roleKey) === "combined" && (!departmentId || user.departmentId === departmentId));
  const myNotifications = (data.notifications || []).filter((notification) => notification.userId === currentUser.id).slice(0, 6);
  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: "metrics-grid dashboard-metrics" },
      h(Metric, { label: "Comptes actifs", value: activeUsers }),
      h(Metric, { label: "Tâches du périmètre", value: tasks.length }),
      h(Metric, { label: "En cours", value: tasks.filter((task) => task.status === "In Progress").length }),
      h(Metric, { label: "Vérifications en attente", value: tasks.filter((task) => task.status === "Waiting for Review").length }),
      h(Metric, { label: "Tâches bloquées", value: tasks.filter((task) => task.status === "Blocked").length }),
      h(Metric, { label: isAdmin ? "Utilisateurs suivis" : "Indice de respect d'engagement", value: isAdmin ? monitoredUsers.length : `${commitmentIndex(commitmentTasks, currentUser.id)} j` }),
    ),
    isAdmin && h(
      "div",
      { className: "grid-2 admin-monitoring" },
      h(
        "article",
        { className: "panel" },
        h("div", { className: "panel-header" }, h("div", null, h("h2", null, "Indices de respect d'engagement"), h("p", { className: "muted" }, "Vérificateurs/Responsables du périmètre sélectionné.")), h(Pill, { color: "blue" }, `${monitoredUsers.length} utilisateurs`)),
        h("div", { className: "report-list engagement-list" }, monitoredUsers.map((user) => h("div", { key: user.id, className: "report-row" }, h("span", null, h("strong", null, userFullName(user)), h("br"), h("small", { className: "muted" }, user.departmentName)), h("strong", null, `${commitmentIndex(commitmentTasks, user.id)} j`))), monitoredUsers.length === 0 && h("p", { className: "muted" }, "Aucun Vérificateur/Responsable dans ce périmètre.")),
      ),
      h(
        "article",
        { className: "panel" },
        h("div", { className: "panel-header" }, h("div", null, h("h2", null, "Tâches du département"), h("p", { className: "muted" }, "Informations complètes selon les filtres administrateur.")), h(Pill, { color: "green" }, `${tasks.length} tâches`)),
        h("div", { className: "task-list" }, tasks.slice(0, 10).map((task) => h(TaskRow, { key: task.id, task, showCreator: true })), tasks.length === 0 && h("p", { className: "muted" }, "Aucune tâche ne correspond aux filtres.")),
      ),
    ),
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Notifications"), h(Pill, { color: "blue" }, `${myNotifications.length}`)), h("div", { className: "activity-list" }, myNotifications.map((item) => h("div", { key: item.id, className: "activity-item" }, h("span", null, item.message), h("span", { className: "muted" }, new Date(item.createdAt).toLocaleDateString("fr-FR")))), myNotifications.length === 0 && h("p", { className: "muted" }, "Aucune notification personnelle."))),
  );
}

function TaskForm({ data, currentUser, onCreate, onCancel, busy }) {
  const activeUsers = data.users.filter((user) => user.isActive !== false && roleKey(user.role || user.roleKey) === "combined");
  const [form, setForm] = useState({
    title: "",
    taskType: "normal",
    consolidationType: "normal_send",
    departmentId: data.departments[0]?.id || "",
    responsibleIds: [activeUsers[0]?.id || ""].filter(Boolean),
    verifierId: roleKey(currentUser.role || currentUser.roleKey) === "combined" ? currentUser.id : activeUsers[0]?.id || "",
    priority: "",
    dueDateLabel: "",
    description: "",
  });
  const requestId = useRef(globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random()}`);
  const submitLock = useRef(false);
  const isDirty = Boolean(form.title || form.description || form.dueDateLabel);
  useUnsavedChanges(isDirty && !busy);
  const responsibleOptions = activeUsers;
  const verifierOptions = activeUsers;

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
    selectField("Priorité optionnelle", "priority", form.priority, update, [["", "Aucune"], ["Low", "Basse"], ["Medium", "Moyenne"], ["High", "Haute"], ["Critical", "Urgente"]], false),
    inputField("Date d'échéance", "dueDateLabel", form.dueDateLabel, update, "", true, "span-2", "date"),
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

function selectField(label, name, value, update, options, required = true) {
  return h("label", null, h("span", null, label), h("select", { name, value, onChange: (e) => update(name, e.target.value), required }, options.map(([id, text]) => h("option", { key: id, value: id }, text))));
}

function Tasks({ data, tasks, filters, setFilters, currentUser, onCreateTask, busy, isAdmin = false }) {
  const [showForm, setShowForm] = useState(false);
  const columns = ["Ready", "In Progress", "Waiting for Review", "Completed"];
  const createdTitle = isAdmin ? "Toutes les tâches" : "Tâches créées par moi";
  const historyTitle = isAdmin ? "Registre détaillé des tâches" : "Historique de mes créations";
  return h(
    React.Fragment,
    null,
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-header" }, h("h2", null, createdTitle), h("div", { className: "filters" }, h(Filters, { departments: data.departments, filters, setFilters, showDepartment: !isAdmin }), h("button", { className: "primary-button", type: "button", disabled: busy, onClick: () => setShowForm((value) => !value) }, "+ Nouvelle tâche"))),
      showForm && h(TaskForm, { data, currentUser, busy, onCancel: () => setShowForm(false), onCreate: onCreateTask }),
      h("div", { className: "task-board" }, columns.map((status) => h("section", { key: status, className: "board-column" }, h("h3", null, statusLabel(status)), tasks.filter((task) => task.status === status).map((task) => h(TaskCard, { key: task.id, task, showCreator: isAdmin })), !tasks.some((task) => task.status === status) && h("p", { className: "muted" }, "Aucune tâche dans cette colonne.")))),
    ),
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, historyTitle), h(Pill, { color: "blue" }, `${tasks.length} tâches`)), h("div", { className: "task-list" }, tasks.map((task) => h(TaskRow, { key: task.id, task, showCreator: isAdmin })), tasks.length === 0 && h("p", { className: "muted" }, isAdmin ? "Aucune tâche ne correspond aux filtres." : "Vous n'avez encore créé aucune tâche correspondant à ces filtres."))),
  );
}

function Todo({ tasks, notifications, activeTaskId, setActiveTaskId, onTaskStatus, busy }) {
  const remainingCount = tasks.filter((task) => !["Waiting for Review", "Completed", "Approved", "Cancelled"].includes(task.status)).length;
  return h(
    React.Fragment,
    null,
    h(
      "article",
      { className: "panel todo-toolbar task-execution-heading" },
      h("div", { className: "panel-header" }, h("div", null, h("h2", null, "À faire"), h("p", { className: "muted" }, "Consultez et réalisez uniquement les tâches qui vous sont affectées comme responsable.")), h(Pill, { color: "blue" }, `${remainingCount} restantes`)),
    ),
    h(Employee, { tasks, notifications, activeTaskId, setActiveTaskId, onTaskStatus, busy }),
  );
}

function TaskCard({ task, showCreator = false }) {
  const isConsolidation = task.taskType === "consolidation";
  const typeLabel = isConsolidation ? `${taskTypeLabels.consolidation} / ${consolidationLabels[task.consolidationType] || ""}` : "Tâche normale";
  const typeClass = isConsolidation ? "task-card-consolidation" : "task-card-normal";
  return h("div", { className: `task-card ${typeClass}`, "data-task-type": task.taskType || "normal" }, h("div", { className: "card-meta" }, h(Pill, { color: isConsolidation ? "green" : "blue" }, task.id), task.priority && h(Pill, { color: priorityClass(task.priority) }, priorityLabel(task.priority))), h("strong", null, task.title), h("span", { className: "muted" }, `${typeLabel} / ${task.departmentName}`), showCreator && h("span", { className: "muted" }, `Créée par : ${task.creatorName || "Non affecté"}`), h("span", { className: "muted" }, `Responsable : ${task.responsibleNames || task.assignedEmployeeName}`), h("span", { className: "muted" }, `Vérificateur : ${task.verifierName || task.supervisorName}`));
}

function Employee({ tasks, notifications = [], activeTaskId, setActiveTaskId, onTaskStatus, busy }) {
  const actionableStatuses = ["In Progress", "Ready", "On Hold", "Blocked", "Pending", "Rejected"];
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
  const waitingTasks = tasks.filter((task) => task.status === "Waiting for Review");
  const finishedTasks = tasks.filter((task) => ["Completed", "Approved", "Cancelled"].includes(task.status));

  useEffect(() => {
    if (current) setActiveTaskId(current.id);
  }, [current?.id]);

  if (!current) return h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Aucune tâche assignée"), h(Pill, { color: "blue" }, "Disponible")), h("p", { className: "muted" }, "Aucune tâche n'est actuellement assignée à ce compte comme responsable."));

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
      current.rejectionReason && h(
        "section",
        { className: "rejection-cause", "aria-label": "Motif du rejet" },
        h("span", { className: "rejection-cause-icon", "aria-hidden": true }, h(Icon, { name: "alert-triangle", size: 20 })),
        h(
          "div",
          null,
          h("strong", null, "Motif du rejet"),
          h("p", null, current.rejectionReason),
          h("small", null, [current.rejectedByName || current.verifierName, current.rejectedAt ? new Date(current.rejectedAt).toLocaleString("fr-FR") : ""].filter(Boolean).join(" / ")),
        ),
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
        h(Metric, { label: "Priorité", value: current.priority ? priorityLabel(current.priority) : "Aucune" }),
        h(Metric, { label: "Retard KPI", value: `${taskDelayDays(current)} j` }),
        h(Metric, { label: "Échéance", value: dueLabel(current.dueDateLabel) }),
      ),
      h(
        "div",
        { className: "work-actions-panel" },
        h("div", null, h("h3", null, "Actions de production"), h("p", { className: "muted" }, employeeActionText(current.status))),
        h("div", { className: "action-grid" }, employeeButtons(current, onTaskStatus, () => setActiveTaskId(activeTasks[0]?.id || tasks[0]?.id), busy)),
      ),
    ),
    h("aside", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "À faire"), h(Pill, { color: "blue" }, `${activeTasks.length} actives`)), notifications.length > 0 && h("div", { className: "employee-history" }, h("h3", null, "Notifications"), h("div", { className: "activity-list" }, notifications.slice(0, 4).map((item) => h("div", { key: item.id, className: "activity-item" }, h("span", null, item.message), h("span", { className: "muted" }, new Date(item.createdAt).toLocaleDateString("fr-FR")))))), h("div", { className: "task-list" }, activeTasks.map((task) => h(TaskRow, { key: task.id, task, compact: true, selected: task.id === current.id, onOpen: setActiveTaskId })), activeTasks.length === 0 && h("p", { className: "muted" }, "Aucune tâche active pour le moment.")), waitingTasks.length > 0 && h("div", { className: "employee-history" }, h("h3", null, "Terminées - en attente de vérification"), h("div", { className: "task-list" }, waitingTasks.map((task) => h(TaskRow, { key: task.id, task, compact: true, selected: task.id === current.id, onOpen: setActiveTaskId })))), finishedTasks.length > 0 && h("div", { className: "employee-history" }, h("h3", null, "Historique"), h("div", { className: "task-list" }, finishedTasks.slice(0, 5).map((task) => h(TaskRow, { key: task.id, task, compact: true, selected: task.id === current.id, onOpen: setActiveTaskId }))))),
  );
}

function employeeActionText(status) {
  if (status === "Ready" || status === "Pending") return "Démarrez la tâche lorsque vous acceptez l'échéance proposée.";
  if (status === "In Progress") return "Marquez la tâche comme terminée lorsque le travail est fini, ou demandez un changement de date au créateur.";
  if (status === "On Hold") return "La tâche est en pause. Reprenez-la lorsque vous pouvez continuer.";
  if (status === "Rejected") return "Consultez le motif du rejet, effectuez les corrections demandées, puis redémarrez la tâche.";
  if (status === "Blocked") return "Ajoutez une note ou reprenez après correction du problème.";
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
    buttons.push(h("span", { key: "review-info", className: "employee-state-message muted" }, "Envoyée au vérificateur pour vérification."));
  }
  else if (task.status === "In Progress") {
    add("Marquer comme terminée", "complete", true);
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

function VerificationTaskRow({ task, isAdmin, busy, onReview }) {
  const [showRejection, setShowRejection] = useState(false);
  const [reason, setReason] = useState("");

  async function submitRejection(event) {
    event.preventDefault();
    const rejectionReason = reason.trim();
    if (!rejectionReason) return;
    const saved = await onReview(task, false, rejectionReason);
    if (saved) {
      setReason("");
      setShowRejection(false);
    }
  }

  return h(
    "div",
    { className: "task-row verification-task-row" },
    h("div", null, h("strong", null, `${task.id} / ${task.title}`), h("p", { className: "muted" }, `${task.departmentName} / Responsable : ${task.responsibleNames || task.assignedEmployeeName} / Vérificateur : ${task.verifierName || task.supervisorName}`)),
    h(
      "div",
      { className: "card-meta" },
      isAdmin
        ? h(Pill, { color: "amber" }, "À traiter par le vérificateur")
        : h(
          React.Fragment,
          null,
          h("button", { className: "primary-button", type: "button", disabled: busy, onClick: () => onReview(task, true) }, "Valider"),
          h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: () => setShowRejection(true) }, "Rejeter"),
        ),
    ),
    !isAdmin && showRejection && h(
      "form",
      { className: "rejection-form", onSubmit: submitRejection },
      h(
        "label",
        null,
        h("span", null, "Motif du rejet"),
        h("textarea", {
          value: reason,
          required: true,
          minLength: 3,
          maxLength: 2000,
          autoFocus: true,
          disabled: busy,
          placeholder: "Décrivez précisément les corrections attendues...",
          "aria-label": "Motif du rejet",
          onChange: (event) => setReason(event.target.value),
        }),
      ),
      h(
        "div",
        { className: "form-actions" },
        h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: () => { setReason(""); setShowRejection(false); } }, "Annuler"),
        h("button", { className: "primary-button rejection-submit", type: "submit", disabled: busy || reason.trim().length < 3 }, "Confirmer le rejet"),
      ),
    ),
  );
}

function Supervisor({ data, tasks, commitmentTasks, filters, setFilters, currentUser, onReview, onUpdateTask, onDeleteTask, busy, isAdmin = false }) {
  const verificationTasks = isAdmin ? tasks : tasks.filter((task) => (task.verifierId || task.supervisorId) === currentUser.id);
  const waiting = verificationTasks.filter((task) => task.status === "Waiting for Review");
  const managedTasks = isAdmin ? tasks : tasks.filter((task) => task.createdBy === currentUser.id);
  const teamUsers = data.users.filter((user) => user.isActive !== false
    && roleKey(user.role || user.roleKey) === "combined"
    && (isAdmin ? (!filters.departmentId || user.departmentId === filters.departmentId) : user.departmentId === currentUser.departmentId));
  return h(
    React.Fragment,
    null,
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Filtres supervision"), h(Filters, { departments: data.departments, filters, setFilters, showDepartment: !isAdmin }))),
    h("div", { className: "metrics-grid" }, h(Metric, { label: "Tâches supervisées", value: tasks.length }), h(Metric, { label: isAdmin ? "Vérifications en attente" : "À vérifier par moi", value: waiting.length }), h(Metric, { label: isAdmin ? "Utilisateurs suivis" : "Indice d'engagement", value: isAdmin ? teamUsers.length : `${commitmentIndex(commitmentTasks, currentUser.id)} j` }), h(Metric, { label: "Demandes de date", value: managedTasks.filter((task) => task.dueDateChangeRequest).length })),
    h(
      "div",
      { className: isAdmin ? "grid-2" : "supervision-review-list" },
      h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "En attente de vérification"), h(Pill, { color: "amber" }, isAdmin ? "Suivi global" : "Vérificateur désigné")), h("div", { className: "task-list" }, waiting.map((task) => h(VerificationTaskRow, { key: task.id, task, isAdmin, busy, onReview })), waiting.length === 0 && h("p", { className: "muted" }, "Aucune tâche en attente."))),
      isAdmin && h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Engagement des utilisateurs"), h(Pill, { color: "green" }, `${teamUsers.length} suivis`)), h("div", { className: "report-list" }, teamUsers.map((user) => h("div", { key: user.id, className: "report-row" }, h("span", null, h("strong", null, userFullName(user)), h("br"), h("small", { className: "muted" }, user.departmentName)), h("strong", null, `${commitmentIndex(commitmentTasks, user.id)} j`))))),
    ),
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-header" }, h("h2", null, isAdmin ? "Gestion de toutes les tâches" : "Gestion de mes tâches créées"), h(Pill, { color: "blue" }, "Supervision")),
      h(
        "div",
        { className: "task-list" },
        managedTasks.map((task) =>
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
        managedTasks.length === 0 && h("p", { className: "muted" }, isAdmin ? "Aucune tâche ne correspond à ces filtres." : "Aucune tâche créée par vous ne correspond à ces filtres."),
      ),
    ),
  );
}

function userInitials(user) {
  return `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "RB";
}

function Users({ data, search, departmentId, currentUser, onCreateUser, onUpdateUser, busy }) {
  const [showForm, setShowForm] = useState(false);
  const initialForm = { firstName: "", lastName: "", email: "", phone: "", role: "Vérificateur/Responsable", departmentId: data.departments[0]?.id || "", temporaryPassword: "" };
  const [form, setForm] = useState(initialForm);
  const query = search.toLowerCase();
  const departmentUsers = data.users.filter((user) => !departmentId || user.departmentId === departmentId);
  const rows = query ? departmentUsers.filter((user) => `${userFullName(user)} ${user.email} ${user.role} ${user.departmentName}`.toLowerCase().includes(query)) : departmentUsers;
  const activeCount = rows.filter((user) => user.isActive).length;
  const administratorCount = rows.filter((user) => roleKey(user.role || user.roleKey) === "admin").length;
  const operationalCount = rows.filter((user) => roleKey(user.role || user.roleKey) === "combined").length;
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
      h(Metric, { label: "Utilisateurs affichés", value: rows.length }),
      h(Metric, { label: "Comptes actifs", value: activeCount }),
      h(Metric, { label: "Vérificateurs/Responsables", value: operationalCount }),
      h(Metric, { label: "Administrateurs", value: administratorCount }),
    ),
    showForm &&
      h("form", { className: "task-form", onSubmit: submit, "aria-busy": busy }, inputField("Prénom", "firstName", form.firstName, update, "", true), inputField("Nom", "lastName", form.lastName, update, "", true), inputField("Email", "email", form.email, update, "prenom@richbond.local", true, "", "email"), inputField("Téléphone", "phone", form.phone, update), selectField("Rôle", "role", form.role, update, [["Vérificateur/Responsable", "Vérificateur/Responsable"], ["Administrateur", "Administrateur"]]), selectField("Département", "departmentId", form.departmentId, update, data.departments.map((dept) => [dept.id, dept.name])), inputField("Mot de passe temporaire", "temporaryPassword", form.temporaryPassword, update, "10 caractères minimum", true, "span-2", "password"), h("p", { className: "password-rules muted span-2" }, "Le nouvel utilisateur devra le remplacer à sa première connexion."), h("div", { className: "form-actions span-2" }, h("button", { className: "primary-button", type: "submit", disabled: busy }, busy ? "Création..." : "Créer l'utilisateur"), h("button", { className: "ghost-button", type: "button", disabled: busy, onClick: closeForm }, "Annuler"))),
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
            h("div", null, h("span", null, "Rôle"), h("strong", null, roleLabel(user))),
            h("div", null, h("span", null, "Département"), h("strong", null, user.departmentName || "Non affecté")),
            h("div", null, h("span", null, "Téléphone"), h("strong", null, user.phone || "Non renseigné")),
            h("div", null, h("span", null, "Indice d'engagement"), h("strong", null, roleKey(user.role || user.roleKey) === "combined" ? `${commitmentIndex(data.tasks, user.id)} j` : "Non applicable")),
          ),
          h("div", { className: "user-actions" }, h("button", { className: "ghost-button", type: "button", disabled: busy || user.id === currentUser.id, title: user.id === currentUser.id ? "Votre propre compte ne peut pas être désactivé" : undefined, onClick: () => onUpdateUser(user.id, { isActive: !user.isActive }) }, user.isActive ? "Désactiver" : "Activer")),
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
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Sécurité"), h(Pill, { color: "green" }, "Contrôles actifs")), h("div", { className: "report-list" }, ["Sessions authentifiées", "Autorisations du compte", "Protection de la connexion", "Journal d'audit"].map((item) => h("div", { key: item, className: "report-row" }, h("span", null, item), h(Pill, { color: "green" }, "Actif"))))),
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
    .filter((user) => roleKey(user.role || user.roleKey) === "combined")
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
    h("div", { className: "metrics-grid" }, h(Metric, { label: "Tâches exportées", value: reportSummary.total }), h(Metric, { label: "Terminées", value: reportSummary.completed }), h(Metric, { label: "En vérification", value: reportSummary.review }), h(Metric, { label: "Bloquées", value: reportSummary.blocked })),
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
  const [view, setView] = useState("dashboard");
  const [theme, setTheme] = useState(() => localStorage.getItem("richbond-theme") || "dark");
  const [filters, setFilters] = useState({ departmentId: "", status: "" });
  const [search, setSearch] = useState("");
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
    setFilters({ departmentId: "", status: "" });
    setSearch("");
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
      const nextData = await request("/api/bootstrap", { timeoutMs: 30000 });
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
    const result = await apiClient.request("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      timeoutMs: 30000,
    });
    const normalizedUser = { ...result.user, roleKey: roleKey(result.user.role || result.user.roleKey) };
    const nextSession = { token: result.token, expiresAt: result.expiresAt, user: normalizedUser };
    saveSession(nextSession);
    setSession(nextSession);
    setLoginMessage("");
    setErrorMessage("");
    setView("dashboard");
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

  const relatedTasks = useMemo(() => {
    if (!currentUser) return [];
    if (currentRole === "admin") return data.tasks;
    return data.tasks.filter((task) => isTaskRelatedToUser(task, currentUser.id));
  }, [data.tasks, currentUser?.id, currentRole]);

  const departmentTasks = useMemo(() => {
    return relatedTasks.filter((task) => !filters.departmentId || task.departmentId === filters.departmentId);
  }, [relatedTasks, filters.departmentId]);

  const scopedTasks = useMemo(() => {
    const query = currentRole === "admin" ? search.trim().toLowerCase() : "";
    return departmentTasks
      .filter((task) => !filters.status || task.status === filters.status)
      .filter((task) => !query || [
        task.id,
        task.title,
        task.description,
        task.departmentName,
        task.creatorName,
        task.responsibleNames,
        task.verifierName,
        statusLabel(task.status),
        priorityLabel(task.priority),
      ].join(" ").toLowerCase().includes(query));
  }, [departmentTasks, filters.status, search, currentRole]);

  const createdTasks = currentRole === "admin" ? scopedTasks : scopedTasks.filter((task) => task.createdBy === currentUser?.id);
  const assignedTasks = currentRole === "combined" ? scopedTasks.filter((task) => taskResponsibleIds(task).includes(currentUser?.id)) : [];
  const supervisionTasks = currentRole === "admin" ? scopedTasks : scopedTasks.filter((task) => task.createdBy === currentUser?.id || (task.verifierId || task.supervisorId) === currentUser?.id);
  const engagementTasks = currentRole === "admin" ? departmentTasks : relatedTasks;

  async function createTask(payload) {
    return runMutation("Création de la tâche", "La tâche a été créée et affectée.", () => request("/api/tasks", { method: "POST", body: JSON.stringify(payload) }));
  }

  async function createDepartment(payload) {
    return runMutation("Création du département", "Le département a été ajouté.", () => request("/api/departments", { method: "POST", body: JSON.stringify(payload) }));
  }

  async function createUser(payload) {
    return runMutation("Création de l'utilisateur", "Le compte utilisateur a été créé.", () => request("/api/users", { method: "POST", body: JSON.stringify(payload) }));
  }

  async function updateUser(id, patch) {
    return runMutation("Mise à jour de l'utilisateur", "Le compte utilisateur a été mis à jour.", () => request(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }));
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
    const actionLabel = action === "complete" ? "Finalisation de la tâche" : "Mise à jour de la tâche";
    const successMessage = action === "complete"
      ? "La tâche est marquée comme terminée et envoyée au vérificateur."
      : "L'action a été enregistrée.";
    return runMutation(actionLabel, successMessage, () => request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify(payload) }));
  }

  async function reviewTask(task, approved, rejectionReason = "") {
    const note = approved ? "Travail validé par le vérificateur." : rejectionReason.trim();
    if (!approved && !note) return false;
    return runMutation(approved ? "Validation de la tâche" : "Rejet de la tâche", approved ? "La tâche a été validée." : "La tâche a été rejetée et renvoyée au responsable.", () => request(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: approved ? "Completed" : "Rejected", note }),
    }));
  }

  if (!currentUser) return h(Login, { onLogin: login, initialMessage: loginMessage });
  if (currentUser.requiresPasswordChange) return h(PasswordChange, { user: currentUser, onChangePassword: changePassword, onLogout: logout });

  const allowedNav = navItems.filter((item) => item.roles.includes(currentRole));
  const isAdmin = currentRole === "admin";
  const showAdminScope = isAdmin && ["dashboard", "tasks", "supervisor", "users"].includes(view);

  const pageTitle = navItems.find((item) => item.id === view)?.label || "Tableau de bord";
  const monitoredUsers = data.users.filter((user) => user.isActive !== false
    && roleKey(user.role || user.roleKey) === "combined"
    && (!filters.departmentId || user.departmentId === filters.departmentId));
  const pendingVerifications = isAdmin
    ? departmentTasks.filter((task) => task.status === "Waiting for Review").length
    : relatedTasks.filter((task) => task.status === "Waiting for Review" && (task.verifierId || task.supervisorId) === currentUser.id).length;

  let content;
  if (view === "dashboard") content = h(Dashboard, { data, tasks: scopedTasks, commitmentTasks: engagementTasks, currentUser, isAdmin, departmentId: filters.departmentId });
  if (view === "tasks") content = h(Tasks, { data, tasks: createdTasks, filters, setFilters, currentUser, onCreateTask: createTask, busy, isAdmin });
  if (view === "todo") content = h(Todo, { tasks: assignedTasks, notifications: data.notifications || [], activeTaskId, setActiveTaskId, onTaskStatus: updateTask, busy });
  if (view === "supervisor") content = h(Supervisor, { data, tasks: supervisionTasks, commitmentTasks: engagementTasks, filters, setFilters, currentUser, onReview: reviewTask, onUpdateTask: updateTaskById, onDeleteTask: deleteTask, busy, isAdmin });
  if (view === "users") content = h(Users, { data, search, departmentId: filters.departmentId, currentUser, onCreateUser: createUser, onUpdateUser: updateUser, busy });
  if (view === "reports") content = h(Reports, { data });
  if (view === "settings") content = h(Settings, { data, onCreateDepartment: createDepartment, busy });

  return h(
    "div",
    { className: "app-shell" },
    h(
      "aside",
      { className: "sidebar", "aria-label": "Navigation principale" },
      h(Brand),
      h(WorkspaceTools, {
        className: "mobile-account-tools",
        currentUser,
        theme,
        onThemeToggle: () => setTheme((value) => (value === "dark" ? "light" : "dark")),
        onLogout: logout,
      }),
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
        h("div", { className: "page-heading" }, h("p", { className: "eyebrow" }, `Espace ${roleLabel(currentUser)}`), h("h1", null, pageTitle)),
        h(WorkspaceTools, {
          className: "desktop-account-tools",
          currentUser,
          theme,
          onThemeToggle: () => setTheme((value) => (value === "dark" ? "light" : "dark")),
          onLogout: logout,
        }),
      ),
      !online && h(StatusBanner, { kind: "offline", message: "Vous êtes hors connexion. Les données affichées peuvent être anciennes." }),
      errorMessage && h(StatusBanner, { kind: "error", message: errorMessage, onRetry: () => refresh({ showLoading: true }).catch(() => undefined), onClose: () => setErrorMessage("") }),
      notice && h(StatusBanner, { kind: "success", message: notice, onClose: () => setNotice("") }),
      pendingAction && h(StatusBanner, { kind: "info", message: `${pendingAction} en cours...` }),
      showAdminScope && h(AdminScopeBar, {
        departments: data.departments,
        search,
        setSearch,
        departmentId: filters.departmentId,
        setDepartmentId: (departmentId) => setFilters((current) => ({ ...current, departmentId })),
      }),
      h(
        "section",
        { className: "hero-status", "aria-label": "État de l'usine" },
        h("div", { className: "hero-copy" }, h("span", { className: "live-label" }, h("span", { className: "pulse-dot" }), "ACTIVITÉ EN DIRECT"), h("strong", null, "La production reste stable"), h("p", null, "Les indicateurs clés et les vérifications sont synchronisés.")),
        h("div", { className: "hero-metrics" }, h("span", null, h("small", null, isAdmin ? "Utilisateurs suivis" : "Mon indice d'engagement"), h("b", null, isAdmin ? monitoredUsers.length : `${commitmentIndex(relatedTasks, currentUser.id)} j`)), h("span", null, h("small", null, "Départements"), h("b", null, filters.departmentId ? 1 : data.departments.length || 0)), h("span", null, h("small", null, "À vérifier"), h("b", null, pendingVerifications))),
      ),
      h("section", { className: "view" }, loading ? h(LoadingState) : content),
    ),
  );
}

const rootElement = document.getElementById("root");
if (rootElement) createRoot(rootElement).render(h(App));
