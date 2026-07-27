export function roleKey(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized.includes("admin") || normalized.includes("super")) return "supervisor";
  return "employee";
}
