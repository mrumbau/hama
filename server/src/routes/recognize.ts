/**
 * Recognize router — Patrol Mode hot path (Tag 7, ADR-3).
 *
 * Flow per frame
 *   1. ml.recognizeTracked(image_b64, tracker_state_key)
 *      ML service detects faces with RetinaFace, runs ByteTrack on the
 *      detections, and either reuses a cached ArcFace embedding for an
 *      existing track or computes a fresh one. Returns each face with a
 *      stable `track_id` and its 512-D vector.
 *   2. For each tracked face: pgvector kNN k=5 + median-of-top-K voting.
 *   3. If similarity > poi.threshold AND no event already exists for the
 *      same (poi_id, camera_id, track_id): INSERT into events. The
 *      track-keyed dedup is *lifelong per track* — a person walking out
 *      and back in is assigned a new track and therefore produces a new
 *      event row, which the D-012 30s time-window debounce could not.
 *
 * The `tracker_state_key` decouples the in-memory tracker slot from the
 * camera label — clients that want a clean per-session reset can pass
 * `${camera_id}:${session_uuid}` and the ML service will allocate a
 * fresh ByteTrack instance. For the Patrol UI we just use the camera_id
 * directly.
 */

import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db.js";
import { logger } from "../lib/pino.js";
import { ml, MlError } from "../lib/ml-client.js";
import { rankCandidates, type KnnCandidate } from "../lib/recognize.js";

export const recognizeRouter = Router();

const KNN_K = 5;

const recognizeBody = z.object({
  image_b64: z.string().min(32),
  camera_id: z.string().min(1).max(64).default("webcam-0"),
  /**
   * Optional. Defaults to camera_id. Provide a per-session value when
   * the operator wants the ByteTrack state to reset between Patrol page
   * loads (typically `${cameraId}:${sessionUuid}`).
   */
  tracker_state_key: z.string().min(1).max(128).optional(),
});

interface MatchedFace {
  bbox: { x: number; y: number; w: number; h: number };
  det_score: number;
  track_id: number;
  embedding_recycled: boolean;
  match: {
    poi_id: string;
    full_name: string;
    category: string;
    similarity: number;
    threshold: number;
    votes: number;
    event_id: string | null; // null when track-dedup'd or below threshold
  } | null;
}

recognizeRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = recognizeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    return;
  }
  const operatorId = req.auth!.sub;
  const {
    image_b64: imageB64,
    camera_id: cameraId,
    tracker_state_key: explicitTrackerKey,
  } = parsed.data;
  const trackerStateKey = explicitTrackerKey ?? cameraId;

  const t0 = Date.now();
  let detectMs = 0;
  let knnMs = 0;
  let insertMs = 0;

  let detection;
  try {
    const t = Date.now();
    detection = await ml.recognizeTracked(imageB64, trackerStateKey);
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
      tracker_state_key: trackerStateKey,
      ml_metrics: detection.metrics,
    });
    return;
  }

  const out: MatchedFace[] = [];
  for (const face of detection.faces) {
    const knnT = Date.now();
    const candidates = await runKnn(face.embedding, KNN_K);
    knnMs += Date.now() - knnT;

    const winner = rankCandidates(candidates);
    if (!winner) {
      out.push({
        bbox: face.bbox,
        det_score: face.det_score,
        track_id: face.track_id,
        embedding_recycled: face.embedding_recycled,
        match: null,
      });
      continue;
    }

    const poi = await loadPoiForMatch(winner.poi_id);
    if (!poi || winner.similarity < poi.threshold) {
      out.push({
        bbox: face.bbox,
        det_score: face.det_score,
        track_id: face.track_id,
        embedding_recycled: face.embedding_recycled,
        match: null,
      });
      continue;
    }

    const insertT = Date.now();
    const eventId = await insertEventTrackKeyed({
      poiId: winner.poi_id,
      cameraId,
      trackId: face.track_id,
      operatorId,
      similarity: winner.similarity,
      bbox: face.bbox,
    });
    insertMs += Date.now() - insertT;

    out.push({
      bbox: face.bbox,
      det_score: face.det_score,
      track_id: face.track_id,
      embedding_recycled: face.embedding_recycled,
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
    tracker_state_key: trackerStateKey,
    ml_metrics: detection.metrics,
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

// ── Event insert with per-(poi, camera, track) lifelong dedup ──────────────

async function insertEventTrackKeyed(opts: {
  poiId: string;
  cameraId: string;
  trackId: number;
  operatorId: string;
  similarity: number;
  bbox: { x: number; y: number; w: number; h: number };
}): Promise<string | null> {
  const { poiId, cameraId, trackId, operatorId, similarity, bbox } = opts;

  // The WHERE-NOT-EXISTS guard is the dedup. Track-keyed: one event per
  // (poi, camera, track) for the lifetime of the track. Once ByteTrack
  // forgets the track and assigns a new id (e.g. person walks back in
  // after lost_track_buffer expires), a fresh event row is created.
  // The supporting partial index is in 0007_track_id_dedup.sql.
  type EventRow = { id: string } & Record<string, unknown>;
  const result = await db.execute<EventRow>(sql`
    INSERT INTO events (poi_id, kind, camera_id, track_id, score, bbox, operator_id, status)
    SELECT ${poiId}, 'recognition'::event_kind, ${cameraId}, ${trackId}::integer,
           ${similarity}::real, ${JSON.stringify(bbox)}::jsonb, ${operatorId},
           'pending'::event_status
    WHERE NOT EXISTS (
      SELECT 1 FROM events
      WHERE poi_id = ${poiId}
        AND camera_id = ${cameraId}
        AND track_id = ${trackId}
    )
    RETURNING id
  `);
  return result.rows[0]?.id ?? null;
}
