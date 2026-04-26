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
  /** null when the (camera, track, poi) triple already had an event row (Tag 7 dedup). */
  event_id: string | null;
}

export interface RecognizeFace {
  bbox: RecognizeBbox;
  det_score: number;
  /** ByteTrack-assigned id, stable across consecutive frames. */
  track_id: number;
  /** True when the embedding was served from the per-track Redis cache. */
  embedding_recycled: boolean;
  match: RecognizeMatch | null;
}

export interface RecognizeResponse {
  faces: RecognizeFace[];
  image: { width: number; height: number };
  latency_ms: { total: number; detect: number; knn: number; insert: number };
  camera_id: string;
  tracker_state_key: string;
  ml_metrics: {
    detections?: number;
    tracked?: number;
    embeds_fresh?: number;
    embeds_recycled?: number;
  };
}

export const recognizeApi = {
  /**
   * POST /api/recognize. Returns null on transport error rather than throwing —
   * Patrol drops frames silently.
   *
   * `trackerStateKey` is what the ML service uses as the per-camera Redis
   * state slot. Defaults to `cameraId` server-side; pass an explicit
   * `${cameraId}:${sessionUuid}` to get a clean tracker on every Patrol
   * page mount.
   */
  async recognize(
    imageB64: string,
    cameraId: string,
    trackerStateKey?: string,
  ): Promise<RecognizeResponse | null> {
    try {
      return await api<RecognizeResponse>("/recognize", {
        method: "POST",
        body: {
          image_b64: imageB64,
          camera_id: cameraId,
          ...(trackerStateKey ? { tracker_state_key: trackerStateKey } : {}),
        },
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
