export const COMBINED_ROLE = "Vérificateur/Responsable";
export const ADMIN_ROLE = "Administrateur";

const COMBINED_ROLE_MARKERS = ["super", "employ", "responsable", "verif", "vã©rif"];

export function roleKey(role) {
  const normalized = String(role || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("admin")) return "admin";
  if (normalized === COMBINED_ROLE.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    || COMBINED_ROLE_MARKERS.some((marker) => normalized.includes(marker))) {
    return "combined";
  }
  return "unknown";
}

export function canonicalRole(role) {
  return roleKey(role) === "admin" ? ADMIN_ROLE : COMBINED_ROLE;
}

export function isCombinedUser(user) {
  return roleKey(user?.role) === "combined";
}

export function isAdministrator(user) {
  return roleKey(user?.role) === "admin";
}

export function canManageOperations(user) {
  return ["admin", "combined"].includes(roleKey(user?.role));
}

// Kept as compatibility aliases while older stored tasks and accounts are migrated.
export const isSupervisor = isCombinedUser;
export const isEmployee = isCombinedUser;
