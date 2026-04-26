/**
 * Sniper Layer 3 — Geographic (Picarta location prediction).
 *
 * One Picarta call per Sniper run, top-K=5 alternatives. Conservative
 * count to stay inside the 10-credit free tier across a demo session.
 */

import { predictLocation, PicartaError } from "../../external/picarta.js";
import type { LayerOutcome } from "./identity.js";
import type { GeographicPayload } from "@argus/shared/fusion";

const PICARTA_TOPK = 5;

export async function runGeographicLayer(
  imageBase64: string,
): Promise<LayerOutcome<GeographicPayload>> {
  const t0 = Date.now();
  try {
    const r = await predictLocation(imageBase64, PICARTA_TOPK);
    return {
      kind: "done",
      payload: {
        country: r.top.country,
        region: r.top.region,
        city: r.top.city,
        coordinates: r.top.gps ?? null,
        confidence: r.top.confidence,
        alternatives: r.alternatives.map((a) => ({
          country: a.country,
          confidence: a.confidence,
        })),
      },
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    const reason =
      err instanceof PicartaError
        ? `picarta_${err.status}_${err.reason}`
        : `geographic_failed: ${(err as Error).message}`;
    return { kind: "failed", reason, latencyMs: Date.now() - t0 };
  }
}
