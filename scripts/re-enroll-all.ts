/**
 * Re-enroll every active face_embeddings row through the new ML pipeline.
 *
 * Why:
 *   Switching INSIGHTFACE_MODEL_PACK (e.g. buffalo_l ↔ buffalo_s)
 *   produces a different embedding space. Existing rows are derived
 *   from the old pack and mathematically meaningless against new
 *   probes — every recognition would either match nothing or match
 *   the wrong POI. Run this once after every model-pack switch in
 *   production. The script is direction-agnostic; it re-embeds against
 *   whatever model the ML service is currently serving.
 *
 * What it does:
 *   1. Reads every face_embeddings row joined to a non-deleted POI.
 *   2. Pulls the original photo from Supabase Storage (`poi-photos`
 *      bucket) by `source_storage_path`.
 *   3. Sends the bytes through the live ML service's /embed endpoint.
 *   4. UPDATEs the embedding column with the new vector.
 *   5. Logs the cosine similarity between the OLD and NEW embedding
 *      per row so you can see how aggressively the geometry shifted.
 *
 * Usage:
 *   tsx scripts/re-enroll-all.ts          # against the env in server/.env
 *   ML_BASE_URL=http://...:8001 \
 *     DATABASE_DIRECT_URL=postgres://... \
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     tsx scripts/re-enroll-all.ts
 *
 * Safety:
 *   - Idempotent: running it twice on the same model pack produces
 *     identical embeddings (ArcFace is deterministic).
 *   - No deletes. If a photo is missing from storage the row is
 *     reported and skipped — manual cleanup via `/poi/<id>`.
 *   - Reads + writes via the service-role pool, bypassing RLS.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { config as loadEnv } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Read server/.env without altering process.env if already set.
loadEnv({ path: join(REPO_ROOT, "server", ".env"), override: false });

const ML_BASE_URL = process.env.ML_BASE_URL ?? "http://127.0.0.1:8001";
const DATABASE_URL = process.env.DATABASE_DIRECT_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing env: need DATABASE_DIRECT_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(2);
}

interface Row {
  id: string;
  poi_id: string;
  full_name: string;
  source_storage_path: string;
  embedding: string; // pgvector text format "[v1,v2,…]"
}

function parsePgvector(literal: string): number[] {
  return literal
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(Number);
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return Number.NaN;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function reEmbed(buf: Buffer): Promise<number[]> {
  const b64 = buf.toString("base64");
  const res = await fetch(`${ML_BASE_URL}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_b64: b64 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ml_embed_${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { embedding: number[]; embedding_dim: number };
  if (body.embedding_dim !== 512) {
    throw new Error(`unexpected embedding_dim=${body.embedding_dim}, expected 512`);
  }
  return body.embedding;
}

async function main(): Promise<void> {
  // ── ML health probe ───────────────────────────────────────────────────
  const health = await fetch(`${ML_BASE_URL}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`ML service not reachable at ${ML_BASE_URL} — start it first.`);
    process.exit(3);
  }
  console.log(`ML reachable at ${ML_BASE_URL}.`);

  // ── DB ────────────────────────────────────────────────────────────────
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const { rows } = await pool.query<Row>(`
    SELECT fe.id::text,
           fe.poi_id::text,
           p.full_name,
           fe.source_storage_path,
           fe.embedding::text AS embedding
    FROM face_embeddings fe
    JOIN poi p ON p.id = fe.poi_id AND p.deleted_at IS NULL
    ORDER BY p.full_name, fe.created_at
  `);
  console.log(`Loaded ${rows.length} embedding rows across ${new Set(rows.map((r) => r.poi_id)).size} POIs.`);

  // ── Storage download via REST (service-role bypasses RLS) ───────────
  const downloadPhoto = async (path: string): Promise<Buffer | null> => {
    const url = `${SUPABASE_URL}/storage/v1/object/poi-photos/${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  };

  let ok = 0;
  let missing = 0;
  let failed = 0;

  for (const row of rows) {
    process.stdout.write(`  ${row.full_name}  ${row.source_storage_path} … `);
    const buf = await downloadPhoto(row.source_storage_path);
    if (!buf) {
      console.log("MISSING");
      missing += 1;
      continue;
    }

    let fresh: number[];
    try {
      fresh = await reEmbed(buf);
    } catch (err) {
      console.log(`FAILED (${(err as Error).message})`);
      failed += 1;
      continue;
    }

    const oldEmbedding = parsePgvector(row.embedding);
    const sim = cosineSim(oldEmbedding, fresh);

    const literal = `[${fresh.join(",")}]`;
    await pool.query(`UPDATE face_embeddings SET embedding = $1::vector(512) WHERE id = $2`, [
      literal,
      row.id,
    ]);
    console.log(`ok  cos(old, new) = ${sim.toFixed(4)}`);
    ok += 1;
  }

  await pool.end();

  console.log("");
  console.log(`Summary: ${ok} updated · ${missing} missing photo · ${failed} ML-failed`);
  if (missing > 0 || failed > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
