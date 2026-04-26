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

interface PicartaResponseRow {
  country?: string;
  region?: string;
  city?: string;
  gps?: [number, number] | null;
  confidence?: number;
}

interface PicartaResponse {
  ai_country?: string;
  ai_region?: string;
  ai_city?: string;
  ai_gps?: [number, number] | null;
  ai_confidence?: number;
  topk?: PicartaResponseRow[];
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
  const url = `${env.PICARTA_BASE_URL}/picarta`;

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
    const top: PicartaTopK = {
      country: r.ai_country,
      region: r.ai_region,
      city: r.ai_city,
      gps: r.ai_gps ?? null,
      confidence: r.ai_confidence ?? 0,
    };
    const alternatives: PicartaTopK[] = (r.topk ?? []).map((row) => ({
      country: row.country,
      region: row.region,
      city: row.city,
      gps: row.gps ?? null,
      confidence: row.confidence ?? 0,
    }));

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
