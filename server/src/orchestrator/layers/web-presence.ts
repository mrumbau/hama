/**
 * Sniper Layer 2 — Web Presence (SerpAPI Google Lens reverse-image search).
 *
 * One reverse-image lookup per Sniper run. The SerpAPI fetcher pulls
 * the image from the short-lived Supabase Storage signed URL we hand
 * it. The result lands in `fusion_layers.payload` matching
 * `webPresencePayloadSchema` from shared/fusion.ts.
 */

import { googleLensReverseSearch, SerpApiError } from "../../external/serpapi.js";
import type { LayerOutcome } from "./identity.js";
import type { WebPresencePayload, WebPresenceHit } from "@argus/shared/fusion";

export async function runWebPresenceLayer(
  imageSignedUrl: string,
): Promise<LayerOutcome<WebPresencePayload>> {
  const t0 = Date.now();
  try {
    const result = await googleLensReverseSearch(imageSignedUrl);
    const hits: WebPresenceHit[] = result.visual_matches.map((m) => ({
      engine: "google_lens" as const,
      url: m.link,
      thumbnail_url: m.thumbnail,
      title: m.title,
      // Google Lens doesn't expose a per-hit score; leave undefined.
    }));
    return {
      kind: "done",
      payload: {
        hits,
        hit_count: result.total_results,
      },
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    const reason =
      err instanceof SerpApiError
        ? `serpapi_${err.status}_${err.reason}`
        : `web_presence_failed: ${(err as Error).message}`;
    return { kind: "failed", reason, latencyMs: Date.now() - t0 };
  }
}
