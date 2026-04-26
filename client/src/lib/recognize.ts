/**
 * Typed wrappers around the Patrol-mode recognise endpoint.
 * Mirrors the server's MatchedFace shape one-to-one.
 */

import { api, ApiError } from "./api";

export interface RecognizeBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RecognizeMatch {
  poi_id: string;
  full_name: string;
  category: string;
  similarity: number;
  threshold: number;
  votes: number;
  /** null when the event was debounced (same poi+camera within 30 s). */
  event_id: string | null;
}

export interface RecognizeFace {
  bbox: RecognizeBbox;
  det_score: number;
  match: RecognizeMatch | null;
}

export interface RecognizeResponse {
  faces: RecognizeFace[];
  image: { width: number; height: number };
  latency_ms: { total: number; detect: number; knn: number; insert: number };
  camera_id: string;
}

export const recognizeApi = {
  /** POST /api/recognize. Returns null on transport error rather than throwing — Patrol drops frames silently. */
  async recognize(imageB64: string, cameraId: string): Promise<RecognizeResponse | null> {
    try {
      return await api<RecognizeResponse>("/recognize", {
        method: "POST",
        body: { image_b64: imageB64, camera_id: cameraId },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        // 4xx are usually no-face / malformed-image — log silently.
        if (err.status >= 400 && err.status < 500) return null;
      }
      // Network errors: also drop silently (Patrol is lossy by nature).
      return null;
    }
  },
};
