import { randomUUID } from "node:crypto";

export function createUser(input) {
  return {
    id: `u-${randomUUID().slice(0, 8)}`,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    passwordHash: input.passwordHash,
    mustChangePassword: true,
    passwordUpdatedAt: null,
    role: input.role,
    departmentId: input.departmentId,
    phone: input.phone,
    avatar: "",
    isActive: true,
    load: input.load,
    createdAt: new Date().toISOString(),
  };
}
