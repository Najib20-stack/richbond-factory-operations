import { DATABASE_URL, NODE_ENV } from "../config/env.js";

if (NODE_ENV === "production" && !DATABASE_URL) {
  throw new Error("DATABASE_URL est obligatoire en production.");
}

const adapter = DATABASE_URL
  ? await import("./postgresDatabase.js")
  : await import("./jsonDatabase.js");

export const databaseEngine = adapter.databaseEngine;
export const ensureDatabase = adapter.ensureDatabase;
export const readDatabase = adapter.readDatabase;
export const writeDatabase = adapter.writeDatabase;
export const updateDatabase = adapter.updateDatabase;
export const findUserForLogin = adapter.findUserForLogin;
export const findAuthentication = adapter.findAuthentication;
export const commitLogin = adapter.commitLogin;
export const commitLogout = adapter.commitLogout;
export const commitPasswordChange = adapter.commitPasswordChange;
export const checkDatabase = adapter.checkDatabase;
export const closeDatabase = adapter.closeDatabase;
