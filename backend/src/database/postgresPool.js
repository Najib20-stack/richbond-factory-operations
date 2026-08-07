import { AsyncLocalStorage } from "node:async_hooks";
import { Pool as NeonPool } from "@neondatabase/serverless";
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
const requestPoolStorage = new AsyncLocalStorage();
let sharedPool;

if (!DATABASE_URL) throw new Error("DATABASE_URL est absent.");
if (!allowedSslModes.has(DATABASE_SSL_MODE)) {
  throw new Error("DATABASE_SSL_MODE doit être disable, require ou verify-full.");
}

function normalizedConnectionString(connectionString = DATABASE_URL) {
  const url = new URL(connectionString);
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(parameter);
  }
  return url.toString();
}

function sslConfiguration() {
  if (DATABASE_SSL_MODE === "disable") return false;
  return { rejectUnauthorized: DATABASE_SSL_MODE === "verify-full" };
}

function monitorPool(pool) {
  pool.on("error", (error) => {
    console.error("Connexion PostgreSQL inactive interrompue.", error);
  });
  return pool;
}

function createSharedPool() {
  return monitorPool(new Pool({
    connectionString: normalizedConnectionString(),
    ssl: sslConfiguration(),
    max: DATABASE_POOL_MAX,
    maxUses: DATABASE_EPHEMERAL_CONNECTIONS ? 1 : Infinity,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
    application_name: "richbond-operations",
  }));
}

function activePool() {
  const requestPool = requestPoolStorage.getStore();
  if (requestPool) return requestPool;
  if (!sharedPool) sharedPool = createSharedPool();
  return sharedPool;
}

export const postgresPool = {
  query(...args) {
    return activePool().query(...args);
  },
  connect(...args) {
    return activePool().connect(...args);
  },
};

export async function withPostgresRequest(connectionString, operation) {
  if (!connectionString) throw new Error("DATABASE_URL est absent de la requête Cloudflare.");
  const requestPool = monitorPool(new NeonPool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
  }));

  return requestPoolStorage.run(requestPool, async () => {
    try {
      return await operation();
    } finally {
      await requestPool.end().catch((error) => {
        console.error("Fermeture de la connexion Neon impossible.", error);
      });
    }
  });
}

export async function closePostgresPool() {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}
