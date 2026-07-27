export function createUser(input, departments) {
  const firstName = String(input.firstName || "").trim();
  const lastName = String(input.lastName || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const role = String(input.role || "Employé").trim();
  const departmentId = String(input.departmentId || departments[0]?.id || "warehouse").trim();

  return {
    id: `u-${Date.now()}`,
    firstName,
    lastName,
    email,
    passwordHash: "demo-only",
    role,
    departmentId,
    phone: String(input.phone || "").trim(),
    avatar: "",
    isActive: true,
    load: Number(input.load || 0),
    createdAt: new Date().toISOString(),
  };
}
