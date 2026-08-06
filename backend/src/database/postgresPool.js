import pg from "pg";
import {
  DATABASE_CONNECTION_TIMEOUT_MS,
  DATABASE_EPHEMERAL_CONNECTIONS,
  DATABASE_POOL_MAX,
  DATABASE_SSL_MODE,
  DATABASE_STATEMENT_TIMEOUT_MS,
  DATABASE_URL,
} from "../config/env.js";

const { Pool } = pg;
const allowedSslModes = new Set(["disable", "require", "verify-full"]);

if (!DATABASE_URL) throw new Error("DATABASE_URL est absent.");
if (!allowedSslModes.has(DATABASE_SSL_MODE)) {
  throw new Error("DATABASE_SSL_MODE doit être disable, require ou verify-full.");
}

function normalizedConnectionString() {
  const url = new URL(DATABASE_URL);
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(parameter);
  }
  return url.toString();
}

function sslConfiguration() {
  if (DATABASE_SSL_MODE === "disable") return false;
  return { rejectUnauthorized: DATABASE_SSL_MODE === "verify-full" };
}

export const postgresPool = new Pool({
  connectionString: normalizedConnectionString(),
  ssl: sslConfiguration(),
  max: DATABASE_POOL_MAX,
  maxUses: DATABASE_EPHEMERAL_CONNECTIONS ? 1 : Infinity,
  connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
  statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
  application_name: "richbond-operations",
});

postgresPool.on("error", (error) => {
  console.error("Connexion PostgreSQL inactive interrompue.", error);
});

export async function closePostgresPool() {
  await postgresPool.end();
}
