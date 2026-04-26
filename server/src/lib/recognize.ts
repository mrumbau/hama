/**
 * Recognition core — median-of-top-K voting over pgvector kNN results.
 *
 * Pure functions only. No DB, no HTTP. The route handler in
 * routes/recognize.ts produces the kNN candidates (via Drizzle SQL or
 * brute-force in tests) and passes them here for ranking.
 *
 * ADR-4 specifies the algorithm:
 *   1. kNN top-K candidates per probe (default K=5)
 *   2. Group by poi_id
 *   3. Winner = highest vote count, tie-break = lowest median distance
 *   4. Score = 1 - median_cosine_distance (back to [0, 1] similarity)
 *
 * pgvector's `<=>` operator returns cosine distance in [0, 2]. Cosine
 * similarity = 1 - cosine_distance. We compare similarity to
 * `poi.threshold` (default 0.55).
 */

export interface KnnCandidate {
  poi_id: string;
  /** Cosine distance from pgvector `<=>`, range [0, 2]. */
  dist: number;
}

export interface RecognitionMatch {
  poi_id: string;
  /** Number of top-K candidates that voted for this POI. */
  votes: number;
  /** Median cosine distance within the winning POI group. */
  median_dist: number;
  /** Cosine similarity in [-1, 1] (= 1 - median_dist). */
  similarity: number;
}

/**
 * Apply median-of-top-K voting to a sorted (by ascending dist) list of
 * kNN candidates. Returns the winning POI or null if the candidate list
 * is empty.
 */
export function rankCandidates(candidates: KnnCandidate[]): RecognitionMatch | null {
  if (candidates.length === 0) return null;

  const byPoi = new Map<string, number[]>();
  for (const c of candidates) {
    const arr = byPoi.get(c.poi_id);
    if (arr) arr.push(c.dist);
    else byPoi.set(c.poi_id, [c.dist]);
  }

  let best: RecognitionMatch | null = null;
  for (const [poi_id, distances] of byPoi.entries()) {
    const median_dist = median(distances);
    const candidate: RecognitionMatch = {
      poi_id,
      votes: distances.length,
      median_dist,
      similarity: 1 - median_dist,
    };
    if (
      best === null ||
      candidate.votes > best.votes ||
      (candidate.votes === best.votes && candidate.median_dist < best.median_dist)
    ) {
      best = candidate;
    }
  }
  return best;
}

/** Numeric median of a non-empty array. */
export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Brute-force cosine kNN. Used by tests to cross-check the SQL HNSW
 * result (HNSW is approximate; with K=5 against ~tens of vectors the
 * top match must agree with brute force).
 *
 * Both inputs are expected to be unit-normalised (ArcFace
 * `normed_embedding` already is). Returns the top-K by ascending
 * cosine distance.
 */
export function bruteForceKnn(
  probe: number[],
  corpus: { poi_id: string; embedding: number[] }[],
  k: number,
): KnnCandidate[] {
  const scored = corpus.map((row) => ({
    poi_id: row.poi_id,
    dist: cosineDistance(probe, row.embedding),
  }));
  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, k);
}

export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector dim mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 1;
  // pgvector cosine distance = 1 - cos_sim, range [0, 2]
  return 1 - dot / denom;
}
