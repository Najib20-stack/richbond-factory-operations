const { useEffect, useMemo, useState } = React;
const h = React.createElement;

const emptyData = { departments: [], users: [], tasks: [], activities: [], notifications: [], reports: [], weeklyProduction: [], kpis: {} };

const navItems = [
  { id: "dashboard", label: "Tableau de bord", icon: "Accueil", roles: ["supervisor"] },
  { id: "tasks", label: "Tâches", icon: "Grille", roles: ["supervisor", "employee"] },
  { id: "employee", label: "Responsable", icon: "Profil", roles: ["employee"] },
  { id: "supervisor", label: "Supervision", icon: "Suivi", roles: ["supervisor"] },
  { id: "reports", label: "Rapports", icon: "Données", roles: ["supervisor"] },
  { id: "users", label: "Utilisateurs", icon: "Équipe", roles: ["supervisor"] },
  { id: "settings", label: "Paramètres", icon: "Config", roles: ["supervisor"] },
];

const statusLabels = {
  Pending: "En attente",
  Ready: "En cours",
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error((await response.text()) || `Erreur ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function RichbondLogo() {
  return h(
    "svg",
    { className: "brand-logo", viewBox: "0 0 720 220", role: "img", "aria-label": "Richbond" },
    h(
      "g",
      { fill: "#082985" },
      h(
        "text",
        {
          x: 430,
          y: 72,
          textAnchor: "middle",
          direction: "rtl",
          unicodeBidi: "bidi-override",
          fontFamily: "Tahoma, Arial, sans-serif",
          fontSize: 54,
          fontWeight: 700,
        },
        "ريشبوند",
      ),
      h(
        "text",
        {
          x: 360,
          y: 178,
          textAnchor: "middle",
          fontFamily: "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive",
          fontSize: 142,
          fontStyle: "italic",
          letterSpacing: -5,
        },
        "Richbond",
      ),
    ),
  );
}

function Pill({ children, color = "" }) {
  return h("span", { className: `pill ${color}` }, children);
}

function Metric({ label, value, detail }) {
  return h("article", { className: "metric-card" }, h("small", null, label), h("strong", null, value), h("span", { className: "muted" }, detail));
}

function Brand({ login = false }) {
  return h(
    "div",
    { className: `brand brand-logo-card ${login ? "login-brand" : ""}` },
    h(RichbondLogo),
    h("div", null, h("span", null, "Operations Usine")),
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("nadia@richbond.local");
  const [password, setPassword] = useState("richbond123");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setMessage("Connexion en cours...");
    try {
      await onLogin(email, password);
    } catch {
      setMessage("Email ou mot de passe incorrect.");
    }
  }

  function demo(address) {
    setEmail(address);
    setPassword("richbond123");
    onLogin(address, "richbond123").catch(() => setMessage("Impossible de connecter ce compte demo."));
  }

  return h(
    "section",
    { className: "login-screen" },
    h(
      "div",
      { className: "login-panel" },
      h(Brand, { login: true }),
      h("div", null, h("p", { className: "eyebrow" }, "Accès sécurisé"), h("h1", null, "Connexion"), h("p", { className: "muted" }, "Connectez-vous avec votre compte pour accéder uniquement à votre espace de travail.")),
      h(
        "form",
        { className: "login-form", onSubmit: submit },
        h("label", null, h("span", null, "Email"), h("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true })),
        h("label", null, h("span", null, "Mot de passe"), h("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), required: true })),
        h("button", { className: "primary-button", type: "submit" }, "Se connecter"),
        h("p", { className: "form-message muted" }, message),
      ),
      h(
        "div",
        { className: "demo-accounts" },
        h("strong", null, "Comptes de démonstration"),
        h("button", { type: "button", onClick: () => demo("nadia@richbond.local") }, "Superviseur : Nadia"),
        h("button", { type: "button", onClick: () => demo("sara@richbond.local") }, "Superviseur : Sara"),
        h("button", { type: "button", onClick: () => demo("youssef@richbond.local") }, "Responsable : Youssef"),
        h("span", null, "Mot de passe : richbond123"),
      ),
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
  const statuses = ["In Progress", "Waiting for Review", "Completed"];
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

function TaskForm({ data, currentUser, onCreate, onCancel }) {
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
    const responsibleIds = (form.responsibleIds || []).filter(Boolean);
    await onCreate({
      ...form,
      responsibleIds,
      assignedEmployeeId: responsibleIds[0],
      supervisorId: form.verifierId,
      status: "In Progress",
      createdBy: currentUser.id,
    });
  }

  return h(
    "form",
    { className: "task-form", onSubmit: submit },
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
    h("div", { className: "form-actions span-2" }, h("button", { className: "primary-button", type: "submit" }, "Créer la tâche"), h("button", { className: "ghost-button", type: "button", onClick: onCancel }, "Annuler")),
  );
}

function inputField(label, name, value, update, placeholder = "", required = false, className = "", type = "text") {
  return h("label", { className }, h("span", null, label), h("input", { name, type, value, placeholder, required, min: type === "number" ? 1 : undefined, onChange: (e) => update(name, e.target.value) }));
}

function selectField(label, name, value, update, options) {
  return h("label", null, h("span", null, label), h("select", { name, value, onChange: (e) => update(name, e.target.value), required: true }, options.map(([id, text]) => h("option", { key: id, value: id }, text))));
}

function Tasks({ data, tasks, filters, setFilters, currentUser, onCreateTask }) {
  const [showForm, setShowForm] = useState(false);
  const columns = ["In Progress", "Waiting for Review", "Completed"];
  return h(
    React.Fragment,
    null,
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-header" }, h("h2", null, "Tâches"), h("div", { className: "filters" }, h(Filters, { departments: data.departments, filters, setFilters }), roleKey(currentUser.role) === "supervisor" && h("button", { className: "primary-button", type: "button", onClick: () => setShowForm((value) => !value) }, "+ Nouvelle tâche"))),
      showForm && h(TaskForm, { data, currentUser, onCancel: () => setShowForm(false), onCreate: async (payload) => { await onCreateTask(payload); setShowForm(false); } }),
      h("div", { className: "task-board" }, columns.map((status) => h("section", { key: status, className: "board-column" }, h("h3", null, statusLabel(status)), tasks.filter((task) => task.status === status).map((task) => h(TaskCard, { key: task.id, task })), !tasks.some((task) => task.status === status) && h("p", { className: "muted" }, "Aucune tâche dans cette colonne.")))),
    ),
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Toutes les tâches correspondantes"), h(Pill, { color: "blue" }, `${tasks.length} lignes`)), h("div", { className: "task-list" }, tasks.map((task) => h(TaskRow, { key: task.id, task })))),
  );
}

function TaskCard({ task }) {
  const typeLabel = task.taskType === "consolidation" ? `${taskTypeLabels.consolidation} / ${consolidationLabels[task.consolidationType] || ""}` : "Tâche normale";
  return h("div", { className: "task-card" }, h("div", { className: "card-meta" }, h(Pill, { color: "blue" }, task.id), task.priority && h(Pill, { color: priorityClass(task.priority) }, priorityLabel(task.priority))), h("strong", null, task.title), h("span", { className: "muted" }, `${typeLabel} / ${task.departmentName}`), h("span", { className: "muted" }, `Responsable : ${task.responsibleNames || task.assignedEmployeeName}`), h("span", { className: "muted" }, `Vérificateur : ${task.verifierName || task.supervisorName}`));
}

function Employee({ tasks, notifications = [], activeTaskId, setActiveTaskId, onTaskStatus }) {
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
    { className: "employee-home" },
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
        h("div", { className: "action-grid" }, employeeButtons(current, onTaskStatus, () => setActiveTaskId(activeTasks[0]?.id || tasks[0]?.id))),
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

function employeeButtons(task, onTaskStatus, openNextTask) {
  const buttons = [];
  const add = (label, action, primary = false) => buttons.push(h("button", { key: action, className: primary ? "primary-button" : "ghost-button", type: "button", onClick: () => onTaskStatus(task, action) }, label));
  if (task.status === "Approved") return h("div", { className: "employee-state-message" }, h("strong", null, "Tâche terminée"), h("span", { className: "muted" }, "Le vérificateur a validé ce travail."), h("button", { className: "ghost-button", type: "button", onClick: openNextTask }, "Voir une tâche active"));
  if (task.status === "Completed") return h("div", { className: "employee-state-message" }, h("strong", null, "Tâche terminée"), h("span", { className: "muted" }, "Cette tâche est archivée dans votre historique."), h("button", { className: "ghost-button", type: "button", onClick: openNextTask }, "Voir une tâche active"));
  if (task.status === "Cancelled") return h("div", { className: "employee-state-message" }, h("strong", null, "Tâche annulée"), h("span", { className: "muted" }, "Aucune intervention n'est nécessaire sur cette tâche."), h("button", { className: "ghost-button", type: "button", onClick: openNextTask }, "Voir une tâche active"));
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

function Supervisor({ data, tasks, filters, setFilters, currentUser, onReview, onUpdateTask, onDeleteTask }) {
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
        return h("div", { key: task.id, className: "task-row" }, h("div", null, h("strong", null, `${task.id} / ${task.title}`), h("p", { className: "muted" }, `${task.departmentName} / Responsable : ${task.responsibleNames || task.assignedEmployeeName} / Vérificateur : ${task.verifierName || task.supervisorName}`)), h("div", { className: "card-meta" }, canVerify ? h("button", { className: "primary-button", type: "button", onClick: () => onReview(task, true) }, "Valider") : h(Pill, { color: "amber" }, "Lecture seule"), canVerify && h("button", { className: "ghost-button", type: "button", onClick: () => onReview(task, false) }, "Refuser")));
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
              h("button", { className: "ghost-button", type: "button", onClick: () => {
                const dueDateLabel = prompt("Nouvelle date d'échéance (AAAA-MM-JJ) :", task.dueDateLabel || "");
                if (dueDateLabel) onUpdateTask(task.id, { dueDateLabel, dueDateChangeRequest: "" });
              } }, "Modifier date"),
              h("button", { className: "ghost-button", type: "button", onClick: () => {
                const employeeId = prompt("ID du nouveau responsable :", task.assignedEmployeeId || "");
                if (employeeId) onUpdateTask(task.id, { assignedEmployeeId: employeeId, responsibleIds: [employeeId] });
              } }, "Réaffecter"),
              h("button", { className: "ghost-button", type: "button", onClick: () => onDeleteTask(task) }, "Supprimer"),
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

function Users({ data, search, onCreateUser, onUpdateUser }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", role: "Employé", departmentId: data.departments[0]?.id || "" });
  const query = search.toLowerCase();
  const rows = query ? data.users.filter((user) => `${userFullName(user)} ${user.email} ${user.role} ${user.departmentName}`.toLowerCase().includes(query)) : data.users;
  const activeCount = rows.filter((user) => user.isActive).length;
  const supervisorCount = rows.filter((user) => roleKey(user.role) === "supervisor").length;
  const employeeCount = rows.length - supervisorCount;

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  return h(
    "article",
    { className: "panel users-panel" },
    h(
      "div",
      { className: "panel-header" },
      h("div", null, h("h2", null, "Utilisateurs de l'usine"), h("p", { className: "muted" }, "Vue organisée des vérificateurs et des responsables actifs.")),
      h("button", { className: "primary-button", type: "button", onClick: () => setShowForm((value) => !value) }, "+ Créer un utilisateur"),
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
      h("form", { className: "task-form", onSubmit: async (e) => { e.preventDefault(); await onCreateUser(form); setShowForm(false); } }, inputField("Prénom", "firstName", form.firstName, update, "", true), inputField("Nom", "lastName", form.lastName, update, "", true), inputField("Email", "email", form.email, update, "prenom@richbond.local", true, "", "email"), inputField("Téléphone", "phone", form.phone, update), selectField("Rôle", "role", form.role, update, [["Employé", "Responsable"], ["Superviseur", "Vérificateur"]]), selectField("Département", "departmentId", form.departmentId, update, data.departments.map((dept) => [dept.id, dept.name])), h("div", { className: "form-actions span-2" }, h("button", { className: "primary-button", type: "submit" }, "Créer l'utilisateur"), h("button", { className: "ghost-button", type: "button", onClick: () => setShowForm(false) }, "Annuler"))),
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
          h("div", { className: "user-actions" }, h("button", { className: "ghost-button", type: "button", onClick: () => onUpdateUser(user.id, { isActive: !user.isActive }) }, user.isActive ? "Désactiver" : "Activer")),
        ),
      ),
      rows.length === 0 && h("p", { className: "muted" }, "Aucun utilisateur ne correspond à la recherche."),
    ),
  );
}

function Settings({ data, onCreateDepartment }) {
  const [form, setForm] = useState({ name: "", description: "", capacity: 50 });
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  return h(
    "div",
    { className: "grid-2" },
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Départements"), h(Pill, { color: "blue" }, `${data.departments.length} départements`)), h("form", { className: "department-form", onSubmit: async (e) => { e.preventDefault(); await onCreateDepartment(form); setForm({ name: "", description: "", capacity: 50 }); } }, inputField("Nom", "name", form.name, update, "Ex. Ressorts", true), inputField("Description", "description", form.description, update, "Description du département"), inputField("Capacité", "capacity", form.capacity, update, "", false, "", "number"), h("button", { className: "primary-button", type: "submit" }, "+ Ajouter")), h("div", { className: "dept-grid" }, data.departments.map((dept) => h("div", { key: dept.id, className: "dept-card" }, h("strong", null, dept.name), h("p", { className: "muted" }, dept.description))))),
    h("article", { className: "panel" }, h("div", { className: "panel-header" }, h("h2", null, "Sécurité"), h(Pill, { color: "green" }, "RBAC actif")), h("div", { className: "report-list" }, ["Gestion des sessions", "Journal d'audit", "Réinitialisation du mot de passe", "Téléversement de fichiers"].map((item) => h("div", { key: item, className: "report-row" }, h("span", null, item), h(Pill, { color: "green" }, "Actif"))))),
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function statusExcelClass(status) {
  if (["Approved", "Completed"].includes(status)) return "status-approved";
  if (status === "Waiting for Review") return "status-review";
  if (status === "Blocked") return "status-blocked";
  return "";
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

  const filteredTasks = data.tasks.filter((task) => {
    const createdDate = String(task.createdAt || "").slice(0, 10);
    const matchesStart = !reportFilters.startDate || createdDate >= reportFilters.startDate;
    const matchesEnd = !reportFilters.endDate || createdDate <= reportFilters.endDate;
    const matchesDepartment = !reportFilters.departmentId || task.departmentId === reportFilters.departmentId;
    return matchesStart && matchesEnd && matchesDepartment;
  });

  const completedCount = filteredTasks.filter((task) => ["Approved", "Completed"].includes(task.status)).length;
  const blockedCount = filteredTasks.filter((task) => task.status === "Blocked").length;
  const reviewCount = filteredTasks.filter((task) => task.status === "Waiting for Review").length;
  const kpiUsers = data.users
    .filter((user) => roleKey(user.role) === "employee")
    .filter((user) => filteredTasks.some((task) => taskResponsibleIds(task).includes(user.id)));

  function exportReport() {
    const departmentName = reportFilters.departmentId ? data.departments.find((dept) => dept.id === reportFilters.departmentId)?.name || reportFilters.departmentId : "Tous les départements";
    const generatedAt = new Date().toLocaleString("fr-FR");
    const taskRows = filteredTasks
      .map(
        (task, index) => `
          <tr class="${statusExcelClass(task.status)}">
            <td>${index + 1}</td>
            <td>${escapeHtml(task.id)}</td>
            <td>${escapeHtml(task.title)}</td>
            <td>${escapeHtml(statusLabel(task.status))}</td>
            <td>${escapeHtml(priorityLabel(task.priority))}</td>
            <td>${escapeHtml(task.departmentName)}</td>
            <td>${escapeHtml(task.assignedEmployeeName)}</td>
            <td>${escapeHtml(task.batchNumber)}</td>
            <td>${escapeHtml(task.quantity)}</td>
            <td>${escapeHtml(task.productionLine)}</td>
            <td>${escapeHtml(dueLabel(task.dueDateLabel))}</td>
            <td>${escapeHtml(String(task.createdAt || "").slice(0, 10))}</td>
            <td>${escapeHtml(Array.isArray(task.notes) && task.notes[0] ? task.notes[0].message : "")}</td>
          </tr>`,
      )
      .join("");

    const html = `
      <table>
        <tr><td class="title" colspan="13">Rapport de production Richbond</td></tr>
        <tr><td class="label">Généré le</td><td colspan="12">${escapeHtml(generatedAt)}</td></tr>
        <tr><td class="label">Période</td><td colspan="12">${escapeHtml(reportFilters.startDate || "Début")} au ${escapeHtml(reportFilters.endDate || "Fin")}</td></tr>
        <tr><td class="label">Département</td><td colspan="12">${escapeHtml(departmentName)}</td></tr>
        <tr><td class="label">Type de rapport</td><td colspan="12">Tâches de production</td></tr>
        <tr><td colspan="13"></td></tr>
        <tr><td class="section" colspan="13">Resume</td></tr>
        <tr>
          <td class="label">Tâches exportées</td><td class="metric">${filteredTasks.length}</td>
          <td class="label">Terminées</td><td class="metric">${completedCount}</td>
          <td class="label">En validation</td><td class="metric">${reviewCount}</td>
          <td class="label">Bloquées</td><td class="metric">${blockedCount}</td>
          <td colspan="5" class="muted">Les lignes colorées indiquent les statuts importants.</td>
        </tr>
        <tr><td colspan="13"></td></tr>
        <tr><td class="section" colspan="13">Détails des tâches</td></tr>
        <tr>
          <th>N</th>
          <th>ID</th>
          <th>Tâche</th>
          <th>Statut</th>
          <th>Priorité</th>
          <th>Département</th>
          <th>Employé</th>
          <th>Lot</th>
          <th>Quantité</th>
          <th>Ligne</th>
          <th>Échéance</th>
          <th>Créée le</th>
          <th>Dernière note</th>
        </tr>
        ${taskRows || '<tr><td colspan="13">Aucune tâche trouvée pour ces filtres.</td></tr>'}
      </table>`;

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
    h("div", { className: "metrics-grid" }, h(Metric, { label: "Tâches exportées", value: filteredTasks.length, detail: "Selon les filtres" }), h(Metric, { label: "Terminées", value: completedCount, detail: "Approuvées ou terminées" }), h(Metric, { label: "En validation", value: reviewCount, detail: "Attente superviseur" }), h(Metric, { label: "Bloquées", value: blockedCount, detail: "Action nécessaire" })),
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

function App() {
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("richbond-user") || "null");
    } catch {
      return null;
    }
  })();
  const [currentUser, setCurrentUser] = useState(storedUser);
  const [data, setData] = useState(emptyData);
  const [view, setView] = useState(storedUser && roleKey(storedUser.role || storedUser.roleKey) === "employee" ? "employee" : "dashboard");
  const [theme, setTheme] = useState(localStorage.getItem("richbond-theme") || "dark");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ departmentId: "", status: "" });
  const [activeTaskId, setActiveTaskId] = useState("");

  const currentRole = roleKey(currentUser?.role || currentUser?.roleKey);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("richbond-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (currentUser) refresh();
  }, [currentUser]);

  async function refresh() {
    setData(await api("/api/bootstrap"));
  }

  async function login(email, password) {
    const user = await api("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
    const normalized = { ...user, roleKey: roleKey(user.role || user.roleKey) };
    localStorage.setItem("richbond-user", JSON.stringify(normalized));
    setCurrentUser(normalized);
    setView(roleKey(normalized.role) === "employee" ? "employee" : "dashboard");
  }

  function logout() {
    localStorage.removeItem("richbond-user");
    setCurrentUser(null);
    setData(emptyData);
    setView("dashboard");
    setSearch("");
    setFilters({ departmentId: "", status: "" });
  }

  const scopedTasks = useMemo(() => {
    if (!currentUser) return [];
    const base = currentRole === "supervisor"
      ? data.tasks.filter((task) => task.departmentId === currentUser.departmentId || (task.verifierId || task.supervisorId) === currentUser.id)
      : data.tasks.filter((task) => taskResponsibleIds(task).includes(currentUser.id));
    return base
      .filter((task) => !filters.departmentId || task.departmentId === filters.departmentId)
      .filter((task) => !filters.status || task.status === filters.status)
      .filter((task) => !search || Object.values(task).join(" ").toLowerCase().includes(search.toLowerCase()));
  }, [data.tasks, currentUser, currentRole, filters, search]);

  async function createTask(payload) {
    await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  }

  async function createUser(payload) {
    await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  }

  async function updateUser(id, patch) {
    await api(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    await refresh();
  }

  async function createDepartment(payload) {
    await api("/api/departments", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  }

  async function updateTaskById(id, patch) {
    await api(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    await refresh();
  }

  async function deleteTask(task) {
    if (!confirm(`Supprimer définitivement la tâche ${task.id} ?`)) return;
    await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    await refresh();
  }

  async function updateTask(task, action) {
    const map = { start: "In Progress", resume: "In Progress", pause: "On Hold", complete: "Waiting for Review", problem: "Blocked", note: task.status, dateChange: task.status };
    let note = "";
    if (action === "problem") note = prompt("Décrivez le problème rencontré :") || "Problème signalé par l'employé.";
    if (action === "dateChange") {
      const dueDateChangeRequest = prompt("Expliquez la demande de changement de date :") || "";
      if (!dueDateChangeRequest) return;
      await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify({ status: task.status, dueDateChangeRequest }) });
      await refresh();
      return;
    }
    if (action === "note") {
      note = prompt("Ajouter une note :") || "";
      if (!note) return;
    }
    await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify({ status: map[action], note }) });
    setActiveTaskId(task.id);
    await refresh();
  }

  async function reviewTask(task, approved) {
    const note = approved ? "Travail validé par le vérificateur." : prompt("Motif du refus (optionnel) :") || "Tâche refusée par le vérificateur.";
    await api(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: approved ? "Completed" : "In Progress",
        note,
      }),
    });
    await refresh();
  }

  if (!currentUser) return h(Login, { onLogin: login });

  const allowedNav = navItems.filter((item) => item.roles.includes(currentRole));
  if (!allowedNav.some((item) => item.id === view)) setTimeout(() => setView(allowedNav[0]?.id || "dashboard"));

  const pageTitle = navItems.find((item) => item.id === view)?.label || "Tableau de bord";

  let content;
  if (view === "dashboard") content = h(Dashboard, { data, tasks: scopedTasks, setView, currentUser });
  if (view === "tasks") content = h(Tasks, { data, tasks: scopedTasks, filters, setFilters, currentUser, onCreateTask: createTask });
  if (view === "employee") content = h(Employee, { tasks: scopedTasks, notifications: (data.notifications || []).filter((item) => item.userId === currentUser.id), activeTaskId, setActiveTaskId, onTaskStatus: updateTask });
  if (view === "supervisor") content = h(Supervisor, { data, tasks: scopedTasks, filters, setFilters, currentUser, onReview: reviewTask, onUpdateTask: updateTaskById, onDeleteTask: deleteTask });
  if (view === "reports") content = h(Reports, { data: { ...data, tasks: scopedTasks } });
  if (view === "users") content = h(Users, { data, search, onCreateUser: createUser, onUpdateUser: updateUser });
  if (view === "settings") content = h(Settings, { data, onCreateDepartment: createDepartment });

  return h(
    "div",
    { className: "app-shell" },
    h("aside", { className: "sidebar", "aria-label": "Navigation principale" }, h(Brand), h("nav", { className: "nav-list" }, allowedNav.map((item) => h("button", { key: item.id, className: `nav-button ${view === item.id ? "active" : ""}`, type: "button", onClick: () => setView(item.id) }, h("span", null, item.icon), h("strong", null, item.label)))), h("div", { className: "factory-pulse" }, h("span", { className: "pulse-dot" }), h("div", null, h("strong", null, "Ligne A-04"), h("span", null, "Synchronisation production")))),
    h(
      "main",
      { className: "main" },
      h("header", { className: "topbar" }, h("div", null, h("p", { className: "eyebrow" }, "Centre de commande"), h("h1", null, pageTitle)), h("div", { className: "topbar-actions" }, h("label", { className: "search" }, h("span", { className: "search-icon", "aria-hidden": true }, "⌕"), h("input", { type: "search", value: search, placeholder: "Rechercher tâches, lots, personnes...", onChange: (e) => { setSearch(e.target.value); if (e.target.value && !["tasks", "supervisor", "employee", "users"].includes(view)) setView(currentRole === "employee" ? "employee" : "tasks"); } })), h("div", { className: "user-chip" }, h("strong", null, userFullName(currentUser)), h("span", null, currentRole === "supervisor" ? "Vérificateur" : "Responsable")), h("button", { className: "icon-button theme-button", type: "button", title: "Changer le thème", "aria-label": "Changer le thème", onClick: () => setTheme((value) => (value === "dark" ? "light" : "dark")) }, h("span", { className: "theme-glyph", "aria-hidden": true })), h("button", { className: "ghost-button logout-button", type: "button", onClick: logout }, "Se déconnecter"))),
      h("section", { className: "hero-status", "aria-label": "État de l'usine" }, h("div", { className: "hero-copy" }, h("p", null, "Aujourd'hui chez Richbond"), h("strong", null, "Le flux de production est stable, avec des validations à suivre par la supervision.")), h("div", { className: "hero-metrics" }, h("span", null, h("b", null, `${data.kpis?.efficiency || 91}%`), " efficacité"), h("span", null, h("b", null, data.departments.length || 0), " départements"), h("span", null, h("b", null, data.tasks.filter((task) => task.status === "Waiting for Review").length), " validations")), h("canvas", { id: "factoryCanvas", width: 720, height: 180, "aria-hidden": true })),
      h("section", { className: "view" }, content),
    ),
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
