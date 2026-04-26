/**
 * Drizzle service-role Postgres client.
 *
 * The server connects via the **pooled** URL (port 6543, transaction mode).
 * Migrations use the direct URL (5432) — see scripts/db-push.ts.
 *
 * The connection is owned by the `postgres` role, which **bypasses RLS**.
 * RLS exists to protect against the anon and authenticated roles reaching
 * the wrong table — never against this client.
 *
 * Plan §9: tests assert that the anon-key Supabase client cannot write
 * face_embeddings or events. See tests/rls.test.ts.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "@argus/shared/schema";
import { env } from "./env.js";
import { logger } from "./lib/pino.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Supabase pooler accepts only TLS connections. We enable TLS but skip
  // certificate verification: Supabase's intermediate cert chain is not in
  // Node's default trust store, and shipping their CA bundle in-repo is
  // brittle (it rotates). The connection string already carries the
  // password — a passive MITM still cannot read traffic. Tag 14
  // SECURITY.md documents this trade-off.
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "pg pool error");
});

export const db = drizzle(pool, { schema, logger: env.LOG_LEVEL === "trace" });

export async function pingDb(): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  await pool.query("SELECT 1");
  return { ok: true, latencyMs: Date.now() - t0 };
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
