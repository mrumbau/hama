/**
 * Recognize router — Patrol Mode hot path.
 *
 * Flow per frame
 *   1. ml.detect(image_b64, with_embeddings=true) — RetinaFace + ArcFace
 *      in one round-trip. Empty face list → respond {faces: []}, no DB.
 *   2. For each face whose ArcFace vector survives RetinaFace's
 *      DETECTOR_MIN_SCORE: pgvector kNN k=5 + median-of-top-K voting
 *      (lib/recognize.ts).
 *   3. If similarity > poi.threshold AND no event in the last
 *      EVENT_DEBOUNCE_MS for the same (poi_id, camera_id): INSERT into
 *      events. Supabase Realtime pushes the row to subscribed clients.
 *
 * The frontend posts at 2-4 fps (Tag 7 ByteTrack pushes the cap to
 * 8 fps via track-then-recognize). Without tracking, the same person
 * standing in frame would generate one event per frame — the debounce
 * keeps the audit trail tractable until ByteTrack lands.
 */

import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db.js";
import { logger } from "../lib/pino.js";
import { ml, MlError } from "../lib/ml-client.js";
import { rankCandidates, type KnnCandidate } from "../lib/recognize.js";

export const recognizeRouter = Router();

// Tag 7 (ByteTrack) replaces this with track-keyed dedup.
const EVENT_DEBOUNCE_MS = 30_000;
const KNN_K = 5;

const recognizeBody = z.object({
  image_b64: z.string().min(32),
  camera_id: z.string().min(1).max(64).default("webcam-0"),
});

interface MatchedFace {
  bbox: { x: number; y: number; w: number; h: number };
  det_score: number;
  match: {
    poi_id: string;
    full_name: string;
    category: string;
    similarity: number;
    threshold: number;
    votes: number;
    event_id: string | null; // null when debounced
  } | null;
}

recognizeRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = recognizeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    return;
  }
  const operatorId = req.auth!.sub;
  const { image_b64: imageB64, camera_id: cameraId } = parsed.data;

  const t0 = Date.now();
  let detectMs = 0;
  let knnMs = 0;
  let insertMs = 0;

  let detection;
  try {
    const t = Date.now();
    detection = await ml.detect(imageB64, true);
    detectMs = Date.now() - t;
  } catch (err) {
    if (err instanceof MlError) {
      res.status(err.status === 422 ? 422 : 502).json({
        error: "ml_failure",
        endpoint: err.endpoint,
        reason: err.reason,
      });
      return;
    }
    logger.error({ err }, "recognize: detect failed");
    res.status(500).json({ error: "internal_error" });
    return;
  }

  if (detection.faces.length === 0) {
    res.json({
      faces: [],
      image: detection.image,
      latency_ms: { total: Date.now() - t0, detect: detectMs, knn: 0, insert: 0 },
      camera_id: cameraId,
    });
    return;
  }

  const out: MatchedFace[] = [];
  for (const face of detection.faces) {
    if (!face.embedding) {
      out.push({ bbox: face.bbox, det_score: face.det_score, match: null });
      continue;
    }
    const knnT = Date.now();
    const candidates = await runKnn(face.embedding, KNN_K);
    knnMs += Date.now() - knnT;

    const winner = rankCandidates(candidates);
    if (!winner) {
      out.push({ bbox: face.bbox, det_score: face.det_score, match: null });
      continue;
    }

    const poi = await loadPoiForMatch(winner.poi_id);
    if (!poi || winner.similarity < poi.threshold) {
      out.push({ bbox: face.bbox, det_score: face.det_score, match: null });
      continue;
    }

    const insertT = Date.now();
    const eventId = await insertEventDebounced({
      poiId: winner.poi_id,
      cameraId,
      operatorId,
      similarity: winner.similarity,
      bbox: face.bbox,
    });
    insertMs += Date.now() - insertT;

    out.push({
      bbox: face.bbox,
      det_score: face.det_score,
      match: {
        poi_id: winner.poi_id,
        full_name: poi.full_name,
        category: poi.category,
        similarity: winner.similarity,
        threshold: poi.threshold,
        votes: winner.votes,
        event_id: eventId,
      },
    });
  }

  res.json({
    faces: out,
    image: detection.image,
    latency_ms: { total: Date.now() - t0, detect: detectMs, knn: knnMs, insert: insertMs },
    camera_id: cameraId,
  });
});

// ── pgvector kNN ────────────────────────────────────────────────────────────

type KnnRow = { poi_id: string; dist: number } & Record<string, unknown>;

async function runKnn(probe: number[], k: number): Promise<KnnCandidate[]> {
  // pgvector accepts the literal `[v1,v2,…]::vector(512)`.
  const probeLiteral = `[${probe.join(",")}]`;
  const result = await db.execute<KnnRow>(sql`
    SELECT fe.poi_id, (fe.embedding <=> ${probeLiteral}::vector(512))::float8 AS dist
    FROM face_embeddings fe
    JOIN poi p ON p.id = fe.poi_id AND p.deleted_at IS NULL
    ORDER BY fe.embedding <=> ${probeLiteral}::vector(512)
    LIMIT ${k}
  `);
  return result.rows.map((r) => ({ poi_id: r.poi_id, dist: Number(r.dist) }));
}

interface PoiForMatch {
  full_name: string;
  category: string;
  threshold: number;
}

type PoiRow = PoiForMatch & Record<string, unknown>;

async function loadPoiForMatch(poiId: string): Promise<PoiForMatch | null> {
  const result = await db.execute<PoiRow>(sql`
    SELECT full_name, category::text AS category, threshold
    FROM poi
    WHERE id = ${poiId} AND deleted_at IS NULL
    LIMIT 1
  `);
  const row = result.rows[0];
  return row
    ? { full_name: row.full_name, category: row.category, threshold: row.threshold }
    : null;
}

// ── Event insert with per-(poi, camera) debounce ───────────────────────────

async function insertEventDebounced(opts: {
  poiId: string;
  cameraId: string;
  operatorId: string;
  similarity: number;
  bbox: { x: number; y: number; w: number; h: number };
}): Promise<string | null> {
  const { poiId, cameraId, operatorId, similarity, bbox } = opts;

  // The WHERE-NOT-EXISTS guard is the debounce. Tag 7 ByteTrack will
  // replace it with track-id-keyed dedup that is robust to a person
  // walking out and back in within the window.
  type EventRow = { id: string } & Record<string, unknown>;
  const result = await db.execute<EventRow>(sql`
    INSERT INTO events (poi_id, kind, camera_id, score, bbox, operator_id, status)
    SELECT ${poiId}, 'recognition'::event_kind, ${cameraId}, ${similarity}::real,
           ${JSON.stringify(bbox)}::jsonb, ${operatorId}, 'pending'::event_status
    WHERE NOT EXISTS (
      SELECT 1 FROM events
      WHERE poi_id = ${poiId}
        AND camera_id = ${cameraId}
        AND created_at > now() - (${EVENT_DEBOUNCE_MS} || ' milliseconds')::interval
    )
    RETURNING id
  `);
  return result.rows[0]?.id ?? null;
}
