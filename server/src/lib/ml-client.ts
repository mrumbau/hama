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
  detect: (imageB64: string) => call<MlDetectResponse>("/detect", { image_b64: imageB64 }),
  embed: (imageB64: string) => call<MlEmbedResponse>("/embed", { image_b64: imageB64 }),
  quality: (imageB64: string) => call<MlQualityResponse>("/quality", { image_b64: imageB64 }),
};
