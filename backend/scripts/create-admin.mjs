import { closeDatabase, updateDatabase } from "../src/database/database.js";
import { createUser } from "../src/models/userModel.js";
import { hashPassword, validateNewPassword } from "../src/security/passwords.js";
import { addAuditEntry } from "../src/utils/audit.js";
import { ADMIN_ROLE } from "../src/utils/roles.js";

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
const firstName = String(process.env.ADMIN_FIRST_NAME || "Administrateur").trim();
const lastName = String(process.env.ADMIN_LAST_NAME || "Richbond").trim();
const requestedDepartment = String(process.env.ADMIN_DEPARTMENT_ID || "").trim();

if (!/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error("ADMIN_EMAIL doit contenir une adresse e-mail valide.");
}

const passwordError = validateNewPassword(password);
if (passwordError) throw new Error(`ADMIN_PASSWORD invalide : ${passwordError}`);

try {
  const passwordHash = await hashPassword(password);
  const result = await updateDatabase((data) => {
    const departmentId = requestedDepartment || data.departments[0]?.id;
    if (!departmentId || !data.departments.some((department) => department.id === departmentId)) {
      throw new Error("ADMIN_DEPARTMENT_ID ne correspond à aucun département.");
    }

    const existing = data.users.find((user) => String(user.email || "").toLowerCase() === email);
    if (existing) {
      existing.firstName = firstName;
      existing.lastName = lastName;
      existing.passwordHash = passwordHash;
      existing.mustChangePassword = true;
      existing.passwordUpdatedAt = null;
      existing.role = ADMIN_ROLE;
      existing.departmentId = departmentId;
      existing.isActive = true;
      data.sessions = (data.sessions || []).filter((session) => session.userId !== existing.id);
      addAuditEntry(data, {
        actorId: null,
        action: "admin.provisioned",
        targetType: "user",
        targetId: existing.id,
        details: { source: "admin:create", updated: true },
      });
      return { id: existing.id, email: existing.email, updated: true };
    }

    const created = createUser({
      firstName,
      lastName,
      email,
      phone: "",
      role: ADMIN_ROLE,
      departmentId,
      load: 0,
      passwordHash,
    });
    data.users.unshift(created);
    addAuditEntry(data, {
      actorId: null,
      action: "admin.provisioned",
      targetType: "user",
      targetId: created.id,
      details: { source: "admin:create", updated: false },
    });
    return { id: created.id, email: created.email, updated: false };
  });

  console.log(`${result.updated ? "Compte administrateur mis à jour" : "Compte administrateur créé"} : ${result.email} (${result.id}).`);
  console.log("Le changement du mot de passe sera obligatoire à la première connexion.");
} finally {
  await closeDatabase();
}
