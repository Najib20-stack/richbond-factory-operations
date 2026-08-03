import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MIGRATIONS_DIR } from "../config/env.js";

const MIGRATION_PATTERN = /^\d{3,}_[a-z0-9_-]+\.sql$/i;

export async function migrationFiles() {
  return (await readdir(MIGRATIONS_DIR))
    .filter((filename) => MIGRATION_PATTERN.test(filename))
    .sort((left, right) => left.localeCompare(right));
}

export async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const version of await migrationFiles()) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, version), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('richbond_schema_migrations'))");
        const existing = await client.query(
          "SELECT checksum FROM schema_migrations WHERE version = $1",
          [version],
        );
        if (existing.rowCount) {
          if (existing.rows[0].checksum !== checksum) {
            throw new Error(`La migration déjà appliquée ${version} a été modifiée.`);
          }
          await client.query("COMMIT");
          continue;
        }

        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [version, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
  } finally {
    client.release();
  }
}
