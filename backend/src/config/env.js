import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = import.meta.url
  ? path.dirname(fileURLToPath(import.meta.url))
  : path.resolve(process.cwd(), "backend", "src", "config");

function positiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const PROJECT_ROOT = path.resolve(currentDir, "../../..");
export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || "0.0.0.0";
export const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend", "dist");
const DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,https://localhost,capacitor://localhost";

export const CORS_ORIGINS = String(process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
export const DATABASE_DIR = process.env.DATABASE_DIR
  ? path.resolve(process.env.DATABASE_DIR)
  : path.join(PROJECT_ROOT, "database");
export const DATABASE_FILE = path.join(DATABASE_DIR, "richbond-db.json");
export const SEED_FILE = process.env.SEED_FILE
  ? path.resolve(process.env.SEED_FILE)
  : path.join(PROJECT_ROOT, "database", "seed.json");
export const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
export const DATABASE_SSL_MODE = String(
  process.env.DATABASE_SSL_MODE || (NODE_ENV === "production" ? "verify-full" : "disable"),
).toLowerCase();
export const DATABASE_POOL_MAX = Math.floor(positiveNumber("DATABASE_POOL_MAX", 10));
export const DATABASE_CONNECTION_TIMEOUT_MS = positiveNumber("DATABASE_CONNECTION_TIMEOUT_MS", 10000);
export const DATABASE_STATEMENT_TIMEOUT_MS = positiveNumber("DATABASE_STATEMENT_TIMEOUT_MS", 15000);
export const DATABASE_EPHEMERAL_CONNECTIONS = String(
  process.env.DATABASE_EPHEMERAL_CONNECTIONS || "false",
).toLowerCase() === "true";
export const DATABASE_AUTO_SEED = String(process.env.DATABASE_AUTO_SEED || "false").toLowerCase() === "true";
export const DATABASE_SKIP_MIGRATIONS = String(
  process.env.DATABASE_SKIP_MIGRATIONS || "false",
).toLowerCase() === "true";
export const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "database", "migrations");
export const SESSION_TTL_MS = positiveNumber("SESSION_TTL_MS", 12 * 60 * 60 * 1000);
export const MAX_REQUEST_BODY_BYTES = positiveNumber("MAX_REQUEST_BODY_BYTES", 1024 * 1024);
export const LOGIN_MAX_ATTEMPTS = positiveNumber("LOGIN_MAX_ATTEMPTS", 5);
export const LOGIN_WINDOW_MS = positiveNumber("LOGIN_WINDOW_MS", 15 * 60 * 1000);
export const LOGIN_LOCK_MS = positiveNumber("LOGIN_LOCK_MS", 15 * 60 * 1000);
