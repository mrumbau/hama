/**
 * Sniper Layer 1 — Identity (pgvector kNN against the POI bank).
 *
 * Inputs: query image bytes (already validated by the orchestrator's
 * upload step). Output: `IdentityPayload` for fusion_layers.payload.
 *
 * Flow
 *   1. ml.embed(image) → 512-D ArcFace vector for the largest detected face
 *      (422 "no_face" propagates as a layer-level failure).
 *   2. pgvector cosine kNN, K = SNIPER_KNN_K (default 10 — Sniper wants
 *      a top list, not just the one winner Patrol Mode picks).
 *   3. rankCandidates() per-poi — the same median-of-top-K voting Tag 6
 *      uses, so a POI with multiple votes outranks one with a single
 *      lower-distance row.
 *   4. Filter to poi.threshold-passing matches (the operator UI shows
 *      others as 'weak match' below the line; this layer only marks
 *      `has_strong_match` if at least one is above its threshold).
 *
 * Latency budget per ADR-6: ≤ 1 s on the dev profile (one ML round-trip
 * + one kNN). Empirically Tag 6 measured ~570ms total for the same
 * pipeline against hosted Supabase Mumbai — comfortably under.
 */

import { sql } from "drizzle-orm";

import { db } from "../../db.js";
import { ml, MlError } from "../../lib/ml-client.js";
import { type KnnCandidate } from "../../lib/recognize.js";
import type { IdentityMatch, IdentityPayload } from "@argus/shared/fusion";

/** Top-K kNN width. Patrol uses 5; Sniper widens because we surface a list. */
const SNIPER_KNN_K = 10;
/** Layer-level result envelope used by orchestrator/sniper.ts. */
export type LayerOutcome<T> =
  | { kind: "done"; payload: T; latencyMs: number }
  | { kind: "failed"; reason: string; latencyMs: number };

export async function runIdentityLayer(imageB64: string): Promise<LayerOutcome<IdentityPayload>> {
  const t0 = Date.now();

  // ── 1. Embed ───────────────────────────────────────────────────────────
  let embedding: number[];
  try {
    const r = await ml.embed(imageB64);
    embedding = r.embedding;
  } catch (err) {
    const reason =
      err instanceof MlError ? `ml_${err.endpoint.replace("/", "")}_${err.reason}` : "ml_failed";
    return { kind: "failed", reason, latencyMs: Date.now() - t0 };
  }

  // ── 2. kNN ─────────────────────────────────────────────────────────────
  type Row = { poi_id: string; dist: number } & Record<string, unknown>;
  const probeLiteral = `[${embedding.join(",")}]`;
  let knnRows: Row[];
  try {
    const result = await db.execute<Row>(sql`
      SELECT fe.poi_id, (fe.embedding <=> ${probeLiteral}::vector(512))::float8 AS dist
      FROM face_embeddings fe
      JOIN poi p ON p.id = fe.poi_id AND p.deleted_at IS NULL
      ORDER BY fe.embedding <=> ${probeLiteral}::vector(512)
      LIMIT ${SNIPER_KNN_K}
    `);
    knnRows = result.rows;
  } catch (err) {
    return {
      kind: "failed",
      reason: `pgvector_knn_failed: ${(err as Error).message}`,
      latencyMs: Date.now() - t0,
    };
  }

  // ── 3. Group + vote per POI ────────────────────────────────────────────
  // rankCandidates() returns the single winner; for the Sniper layer we
  // want every POI that appeared in the top-K, ranked by votes then
  // similarity. Reuse the same grouping logic.
  const candidates: KnnCandidate[] = knnRows.map((r) => ({
    poi_id: r.poi_id,
    dist: Number(r.dist),
  }));

  const byPoi = new Map<string, number[]>();
  for (const c of candidates) {
    const arr = byPoi.get(c.poi_id);
    if (arr) arr.push(c.dist);
    else byPoi.set(c.poi_id, [c.dist]);
  }

  // ── 4. Hydrate POI metadata (full_name, category, threshold) ───────────
  const poiIds = [...byPoi.keys()];
  if (poiIds.length === 0) {
    return {
      kind: "done",
      payload: { matches: [], has_strong_match: false, corpus_size: await corpusSize() },
      latencyMs: Date.now() - t0,
    };
  }

  type PoiRow = {
    id: string;
    full_name: string;
    category: string;
    threshold: number;
  } & Record<string, unknown>;
  const poiResult = await db.execute<PoiRow>(sql`
    SELECT id, full_name, category::text AS category, threshold
    FROM poi
    WHERE id IN (${sql.join(
      poiIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      AND deleted_at IS NULL
  `);
  const poiById = new Map(poiResult.rows.map((p) => [p.id, p]));

  const matches: IdentityMatch[] = [];
  let hasStrongMatch = false;
  for (const [poi_id, distances] of byPoi.entries()) {
    const poi = poiById.get(poi_id);
    if (!poi) continue;
    const sortedDist = [...distances].sort((a, b) => a - b);
    const mid = Math.floor(sortedDist.length / 2);
    const median_dist =
      sortedDist.length % 2 === 0
        ? (sortedDist[mid - 1] + sortedDist[mid]) / 2
        : sortedDist[mid];
    const similarity = 1 - median_dist;
    if (similarity >= poi.threshold) hasStrongMatch = true;
    matches.push({
      poi_id,
      full_name: poi.full_name,
      category: poi.category,
      similarity,
      threshold: poi.threshold,
      votes: distances.length,
    });
  }

  // Sort: more votes first, then higher similarity.
  matches.sort((a, b) => b.votes - a.votes || b.similarity - a.similarity);

  return {
    kind: "done",
    payload: {
      matches,
      has_strong_match: hasStrongMatch,
      corpus_size: await corpusSize(),
    },
    latencyMs: Date.now() - t0,
  };
}

async function corpusSize(): Promise<number> {
  type Row = { n: string } & Record<string, unknown>;
  const r = await db.execute<Row>(sql`
    SELECT COUNT(*)::text AS n
    FROM face_embeddings fe
    JOIN poi p ON p.id = fe.poi_id AND p.deleted_at IS NULL
  `);
  return Number(r.rows[0]?.n ?? 0);
}
