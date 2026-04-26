/**
 * scripts/db-push.ts
 *
 * Applies every supabase/migrations/*.sql file in lexicographic order against
 * the Postgres pointed to by DATABASE_DIRECT_URL. Tracks applied files in a
 * `__argus_migrations` table so re-running is idempotent.
 *
 * We deliberately do NOT use drizzle-kit migrate, because part of the migration
 * set is hand-written (extensions, FK to auth.users, RLS, HNSW, buckets) and
 * drizzle-kit only owns the schema diff. One runner, one journal.
 *
 * Usage: pnpm tsx scripts/db-push.ts
 *
 * Environment:
 *   DATABASE_DIRECT_URL — non-pooled connection string (port 5432)
 *                         from server/.env
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");

async function loadServerEnv() {
  // Load server/.env so this script can be run without the user setting env
  // vars manually. Mirrors what server/src/index.ts does.
  const dotenv = await import("dotenv");
  dotenv.config({ path: join(repoRoot, "server", ".env") });
}

async function main() {
  await loadServerEnv();

  const url = process.env.DATABASE_DIRECT_URL;
  if (!url) {
    console.error("DATABASE_DIRECT_URL is not set. Fill server/.env and retry.");
    process.exit(1);
  }
  if (url.includes("TODO_REGION") || url.includes("TODO_FILL")) {
    console.error("DATABASE_DIRECT_URL still contains a TODO placeholder.");
    process.exit(1);
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error("No .sql files in supabase/migrations/.");
    process.exit(1);
  }

  console.log(`Connecting to ${redactPassword(url)} …`);
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.__argus_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now(),
        sha256 text NOT NULL
      );
    `);

    const { rows: applied } = await client.query<{ filename: string; sha256: string }>(
      "SELECT filename, sha256 FROM public.__argus_migrations",
    );
    const appliedMap = new Map(applied.map((r) => [r.filename, r.sha256]));

    let appliedCount = 0;
    let skippedCount = 0;

    for (const filename of files) {
      const sql = readFileSync(join(migrationsDir, filename), "utf8");
      const sha = await sha256(sql);
      const prior = appliedMap.get(filename);

      if (prior === sha) {
        console.log(`  skip   ${filename} (already applied)`);
        skippedCount++;
        continue;
      }
      if (prior && prior !== sha) {
        console.error(
          `  ERROR  ${filename} content changed since it was applied. ` +
            "Manual fix required: rewrite as a new migration file.",
        );
        process.exit(1);
      }

      const t0 = Date.now();
      console.log(`  apply  ${filename} …`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.__argus_migrations (filename, sha256) VALUES ($1, $2)",
          [filename, sha],
        );
        await client.query("COMMIT");
        console.log(`         ✓ ${Date.now() - t0}ms`);
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`         ✗ ${(err as Error).message}`);
        throw err;
      }
    }

    console.log(`Done. applied=${appliedCount} skipped=${skippedCount}`);
  } finally {
    await client.end();
  }
}

function redactPassword(url: string): string {
  return url.replace(/:([^@/]+)@/, ":***@");
}

async function sha256(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
