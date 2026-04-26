/**
 * Typed client for the Python ML service (FastAPI).
 *
 * One module wraps all three endpoints: /detect /embed /quality. Every
 * call goes through a shared fetch with timeout and error normalisation
 * so the orchestrator never accidentally double-implements timeouts or
 * forgets to JSON-parse error bodies.
 *
 * The schemas mirror python/argus_ml/schemas.py one-to-one. Keep them
 * in sync — no codegen, just two files in two languages saying the
 * same thing. Tag 11 adds a smoke test that round-trips a known image
 * through both layers.
 */

import { env } from "../env.js";
import { logger } from "./pino.js";

// ── Wire types — must mirror python/argus_ml/schemas.py ─────────────────────

export interface MlBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MlFace {
  bbox: MlBbox;
  det_score: number;
  yaw_deg: number;
  blur_var: number;
  landmarks: number[][];
  /** 512-D ArcFace vector. Populated only when /detect is called with with_embeddings=true. */
  embedding: number[] | null;
}

export interface MlDetectResponse {
  faces: MlFace[];
  image: { width: number; height: number };
}

export interface MlEmbedResponse {
  face: MlFace;
  embedding: number[]; // 512-D float
  embedding_dim: number;
}

export interface MlQualityResponse {
  passes: boolean;
  reasons: string[];
  metrics: Record<string, number>;
  face: MlFace | null;
}

// ── /recognize-tracked (Tag 7, ADR-3) ───────────────────────────────────────

export interface MlTrackedFace {
  bbox: MlBbox;
  det_score: number;
  yaw_deg: number;
  blur_var: number;
  landmarks: number[][];
  /** 512-D ArcFace vector. Always populated for tracked faces. */
  embedding: number[];
  /** ByteTrack-assigned id, stable across consecutive Patrol-Mode frames. */
  track_id: number;
  /** True when the embedding came from Redis cache (Tag 7 speedup path). */
  embedding_recycled: boolean;
  /** 0 for a fresh embedding; positive for cached ones (cache age). */
  embedding_age_ms: number;
}

export interface MlRecognizeTrackedResponse {
  faces: MlTrackedFace[];
  image: { width: number; height: number };
  tracker_state_key: string;
  metrics: {
    detections?: number;
    tracked?: number;
    embeds_fresh?: number;
    embeds_recycled?: number;
  };
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class MlError extends Error {
  readonly status: number;
  readonly reason: string;
  readonly endpoint: string;
  constructor(endpoint: string, status: number, reason: string, message?: string) {
    super(message ?? `${endpoint} failed: ${status} ${reason}`);
    this.name = "MlError";
    this.endpoint = endpoint;
    this.status = status;
    this.reason = reason;
  }
}

// ── Internal fetch ──────────────────────────────────────────────────────────

async function call<T>(endpoint: string, body: unknown): Promise<T> {
  const url = `${env.ML_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ML_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      // FastAPI 422 detail: { error: "no_face" } | string
      let reason = `http_${res.status}`;
      if (parsed && typeof parsed === "object" && "detail" in parsed) {
        const detail = (parsed as { detail: unknown }).detail;
        if (detail && typeof detail === "object" && "error" in detail) {
          reason = String((detail as { error: unknown }).error);
        } else if (typeof detail === "string") {
          reason = detail;
        }
      }
      throw new MlError(endpoint, res.status, reason);
    }

    return parsed as T;
  } catch (err) {
    if (err instanceof MlError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new MlError(endpoint, 504, "ml_timeout", `timed out after ${env.ML_TIMEOUT_MS}ms`);
    }
    logger.error({ err, endpoint }, "ml-client: unexpected failure");
    throw new MlError(endpoint, 502, "ml_unreachable", (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const ml = {
  /**
   * Multi-face detection. Pass `withEmbeddings=true` for Patrol Mode
   * (one ML round-trip → all faces + 512-D vectors per face); leave
   * default for lighter bbox-only payloads (Tag 7 multi-camera matrix).
   */
  detect: (imageB64: string, withEmbeddings = false) =>
    call<MlDetectResponse>("/detect", {
      image_b64: imageB64,
      with_embeddings: withEmbeddings,
    }),
  embed: (imageB64: string) => call<MlEmbedResponse>("/embed", { image_b64: imageB64 }),
  quality: (imageB64: string) => call<MlQualityResponse>("/quality", { image_b64: imageB64 }),
  /**
   * Tag 7 hot path: detect → ByteTrack → cache-or-embed.
   *
   * `trackerStateKey` is what the ML service uses as the per-camera
   * Redis state slot. Recommended: `${camera_id}` (one tracker per
   * physical camera) or `${camera_id}:${session_uuid}` for clean
   * per-session resets.
   */
  recognizeTracked: (imageB64: string, trackerStateKey: string) =>
    call<MlRecognizeTrackedResponse>("/recognize-tracked", {
      image_b64: imageB64,
      tracker_state_key: trackerStateKey,
    }),
};
