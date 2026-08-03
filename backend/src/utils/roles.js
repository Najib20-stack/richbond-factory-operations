export function roleKey(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized.includes("admin") || normalized.includes("super")) return "supervisor";
  return "employee";
}

export function isSupervisor(user) {
  return roleKey(user?.role) === "supervisor";
}

export function isEmployee(user) {
  return roleKey(user?.role) === "employee";
}
