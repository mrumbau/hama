/**
 * Picarta client — image-based geolocation.
 *
 * Used by Sniper Layer 3 (Geographic). One call per Sniper run.
 * Picarta's `/api/v1/picarta` endpoint accepts a JSON body with the
 * image as a base64 string and returns top-N predicted locations
 * with confidence scores.
 *
 * The free tier ships ~10 credits — keeping the call count to one per
 * Sniper run keeps a long demo session inside the credit ceiling. The
 * cost guard (lib/cost-guard.ts) is the second line of defence.
 */

import { env } from "../env.js";
import { logger } from "../lib/pino.js";

export interface PicartaTopK {
  country?: string;
  region?: string;
  city?: string;
  /** [lat, lng] pair — null when Picarta returns no coordinates. */
  gps?: [number, number] | null;
  confidence: number;
}

export interface PicartaPrediction {
  /** Highest-confidence guess. */
  top: PicartaTopK;
  /** Up to topk_count alternatives (already ordered by confidence). */
  alternatives: PicartaTopK[];
  latency_ms: number;
}

export class PicartaError extends Error {
  readonly status: number;
  readonly reason: string;
  constructor(status: number, reason: string, message?: string) {
    super(message ?? `picarta failed: ${status} ${reason}`);
    this.name = "PicartaError";
    this.status = status;
    this.reason = reason;
  }
}

interface PicartaTopkRow {
  address?: { city?: string; country?: string; province?: string };
  gps?: [number, number] | null;
  confidence?: number;
}

/**
 * Picarta `/classify` response shape (verified against the live
 * endpoint Tag 14). Top-level `ai_*` fields carry the top-1 guess as
 * separate scalars (`ai_country` + `ai_lat` + `ai_lon` rather than a
 * tuple), and `topk_predictions_dict` is an *object* keyed by stringified
 * positional rank ("1", "2", ...), not an array.
 */
interface PicartaResponse {
  ai_country?: string;
  ai_lat?: number;
  ai_lon?: number;
  ai_confidence?: number;
  city?: string;
  province?: string;
  topk_predictions_dict?: Record<string, PicartaTopkRow>;
}

/**
 * Predict the location where the image was taken.
 *
 * `imageBase64` is a raw base64 string — the bytes only, no
 * `data:image/jpeg;base64,` prefix.
 */
export async function predictLocation(
  imageBase64: string,
  topkCount = 5,
): Promise<PicartaPrediction> {
  const t0 = Date.now();
  const url = `${env.PICARTA_BASE_URL}/classify`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.PICARTA_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        TOKEN: env.PICARTA_API_KEY,
        IMAGE: imageBase64,
        TOP_K: topkCount,
      }),
    });

    const text = await res.text();
    let body: PicartaResponse | { detail?: string } | string | null = null;
    try {
      body = JSON.parse(text) as PicartaResponse;
    } catch {
      throw new PicartaError(res.status, "non_json_response", text.slice(0, 200));
    }

    if (!res.ok) {
      const errMsg =
        body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
          ? body.detail
          : `http_${res.status}`;
      throw new PicartaError(res.status, errMsg);
    }

    const r = body as PicartaResponse;
    const topGps: [number, number] | null =
      typeof r.ai_lat === "number" && typeof r.ai_lon === "number"
        ? [r.ai_lat, r.ai_lon]
        : null;
    const top: PicartaTopK = {
      country: r.ai_country,
      region: r.province,
      city: r.city,
      gps: topGps,
      confidence: r.ai_confidence ?? 0,
    };

    // topk_predictions_dict comes as { "1": row, "2": row, ... }. The
    // dict's first entry duplicates the top-1 (same content as the
    // ai_* scalars); we surface entries 2..N as alternatives.
    const alternatives: PicartaTopK[] = [];
    if (r.topk_predictions_dict) {
      const sortedKeys = Object.keys(r.topk_predictions_dict).sort(
        (a, b) => Number(a) - Number(b),
      );
      for (const key of sortedKeys.slice(1)) {
        const row = r.topk_predictions_dict[key];
        alternatives.push({
          country: row.address?.country,
          region: row.address?.province,
          city: row.address?.city,
          gps: row.gps ?? null,
          confidence: row.confidence ?? 0,
        });
      }
    }

    return { top, alternatives, latency_ms: Date.now() - t0 };
  } catch (err) {
    if (err instanceof PicartaError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new PicartaError(504, "timeout", `timed out after ${env.PICARTA_TIMEOUT_MS}ms`);
    }
    logger.error({ err }, "picarta: unexpected failure");
    throw new PicartaError(502, "unreachable", (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
