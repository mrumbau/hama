/**
 * Recognition correctness tests.
 *
 * Two layers of confidence:
 *
 * 1. Pure-logic tests on rankCandidates / median / bruteForceKnn —
 *    no DB, no model. Verifies the median-of-top-K voting math.
 *
 * 2. Cross-check pgvector HNSW against TypeScript brute-force cosine
 *    against the live Supabase project. The HNSW index is approximate;
 *    with K=5 against tens of vectors the top match must agree with
 *    the exhaustive scan. Requires the project to have at least one
 *    POI with embeddings (Tag 5 enrolled the Trump set).
 *
 * Plan §13 Tag 6 gate: "Score-Korrektheit per pytest gegen Brute-Force-
 * Cosine." We run it in vitest because the server's recognize logic is
 * TypeScript and reading the corpus from Postgres for the comparison
 * requires the same Drizzle wiring the production hot path uses.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnvFile } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Pull DATABASE_URL etc from server/.env so the live HNSW cross-check is
// enabled when run against a configured project.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile({ path: join(__dirname, "..", ".env") });

// Stub the values that don't come from .env (or that we want pinned for tests).
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";

import {
  bruteForceKnn,
  cosineDistance,
  median,
  rankCandidates,
  type KnnCandidate,
} from "../src/lib/recognize.js";

// ── Pure logic ──────────────────────────────────────────────────────────────

describe("recognize core", () => {
  it("median: odd length", () => {
    expect(median([0.1, 0.5, 0.3])).toBeCloseTo(0.3);
  });
  it("median: even length", () => {
    expect(median([0.1, 0.2, 0.3, 0.4])).toBeCloseTo(0.25);
  });

  it("rankCandidates: returns null for empty input", () => {
    expect(rankCandidates([])).toBeNull();
  });

  it("rankCandidates: single candidate wins by default", () => {
    const r = rankCandidates([{ poi_id: "A", dist: 0.2 }]);
    expect(r?.poi_id).toBe("A");
    expect(r?.votes).toBe(1);
    expect(r?.median_dist).toBeCloseTo(0.2);
    expect(r?.similarity).toBeCloseTo(0.8);
  });

  it("rankCandidates: majority vote beats lower-distance minority", () => {
    // POI A: 3 votes, median 0.30. POI B: 2 votes, median 0.05.
    // ADR-4 says A wins despite B being closer, because votes break tie.
    const r = rankCandidates([
      { poi_id: "B", dist: 0.05 },
      { poi_id: "B", dist: 0.05 },
      { poi_id: "A", dist: 0.25 },
      { poi_id: "A", dist: 0.3 },
      { poi_id: "A", dist: 0.35 },
    ]);
    expect(r?.poi_id).toBe("A");
    expect(r?.votes).toBe(3);
    expect(r?.median_dist).toBeCloseTo(0.3);
  });

  it("rankCandidates: tie-break on votes goes to lower median distance", () => {
    const r = rankCandidates([
      { poi_id: "A", dist: 0.4 },
      { poi_id: "A", dist: 0.5 },
      { poi_id: "B", dist: 0.1 },
      { poi_id: "B", dist: 0.2 },
    ]);
    expect(r?.poi_id).toBe("B");
    expect(r?.median_dist).toBeCloseTo(0.15);
  });

  it("cosineDistance: identical unit vectors → 0", () => {
    const v = [1, 0, 0];
    expect(cosineDistance(v, v)).toBeCloseTo(0);
  });
  it("cosineDistance: orthogonal vectors → 1", () => {
    expect(cosineDistance([1, 0, 0], [0, 1, 0])).toBeCloseTo(1);
  });
  it("cosineDistance: opposite vectors → 2", () => {
    expect(cosineDistance([1, 0, 0], [-1, 0, 0])).toBeCloseTo(2);
  });

  it("bruteForceKnn: returns top-K by ascending distance", () => {
    const probe = [1, 0, 0];
    const corpus = [
      { poi_id: "A", embedding: [1, 0, 0] },
      { poi_id: "B", embedding: [0.9, 0.1, 0] },
      { poi_id: "C", embedding: [0, 0, 1] },
      { poi_id: "D", embedding: [-1, 0, 0] },
    ];
    const k = bruteForceKnn(probe, corpus, 3);
    expect(k.map((x) => x.poi_id)).toEqual(["A", "B", "C"]);
    expect(k[0].dist).toBeCloseTo(0);
  });
});

// ── Live cross-check (skips if DATABASE_URL missing or no embeddings) ───────

const HAS_DB = Boolean(process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL);

describe.skipIf(!HAS_DB)("recognize: HNSW vs brute-force on live corpus", () => {
  let corpus: { poi_id: string; embedding: number[] }[] = [];
  let dbModule: typeof import("../src/db.js") | null = null;
  let recognizeModule: typeof import("../src/routes/recognize.js") | null = null;

  beforeAll(async () => {
    // Lazy-import db.ts so the env-stub above is honoured.
    dbModule = await import("../src/db.js");
    // The route module is not imported (it would mount the express router);
    // we re-implement runKnn inline to keep this test focused.
    recognizeModule = null;

    const { sql } = await import("drizzle-orm");
    type Row = { poi_id: string; embedding: string } & Record<string, unknown>;
    const result = await dbModule.db.execute<Row>(sql`
      SELECT fe.poi_id, fe.embedding::text AS embedding
      FROM face_embeddings fe
      JOIN poi p ON p.id = fe.poi_id AND p.deleted_at IS NULL
      LIMIT 200
    `);
    corpus = result.rows.map((r) => ({
      poi_id: r.poi_id,
      embedding: parseVector(r.embedding),
    }));
  }, 30_000);

  afterAll(async () => {
    if (dbModule) await dbModule.closeDb();
    void recognizeModule;
  });

  it("loads at least one embedding from the live corpus", () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it("HNSW top-1 agrees with brute-force top-1 for every enrolled embedding", async () => {
    if (corpus.length === 0) return; // skipif above protects

    const { sql } = await import("drizzle-orm");
    type Row = { poi_id: string; dist: number } & Record<string, unknown>;

    let mismatches = 0;
    for (const probe of corpus) {
      const probeLit = `[${probe.embedding.join(",")}]`;
      const hnsw = await dbModule!.db.execute<Row>(sql`
        SELECT fe.poi_id, (fe.embedding <=> ${probeLit}::vector(512))::float8 AS dist
        FROM face_embeddings fe
        JOIN poi p ON p.id = fe.poi_id AND p.deleted_at IS NULL
        ORDER BY fe.embedding <=> ${probeLit}::vector(512)
        LIMIT 5
      `);
      const hnswCandidates: KnnCandidate[] = hnsw.rows.map((r) => ({
        poi_id: r.poi_id,
        dist: Number(r.dist),
      }));

      const brute = bruteForceKnn(probe.embedding, corpus, 5);

      const hnswWinner = rankCandidates(hnswCandidates);
      const bruteWinner = rankCandidates(brute);

      if (hnswWinner?.poi_id !== bruteWinner?.poi_id) {
        mismatches++;
      }
    }
    // HNSW with m=16, ef_construction=64 should agree with brute force
    // on every probe in a corpus this small.
    expect(mismatches).toBe(0);
  }, 60_000);
});

function parseVector(literal: string): number[] {
  // pgvector text format: "[v1,v2,…]"
  const trimmed = literal.replace(/^\[|\]$/g, "");
  return trimmed.split(",").map(Number);
}
