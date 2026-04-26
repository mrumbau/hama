/**
 * Sniper Layer 4 — Authenticity (Reality Defender deepfake / replay check).
 *
 * One scan per Sniper run. RD_MOCK_MODE=true returns the deterministic
 * mock (matches D-010); RD_MOCK_MODE=false hits the real RD presigned-
 * upload + polling flow.
 */

import { checkAuthenticity } from "../../external/reality-defender.js";
import type { LayerOutcome } from "./identity.js";
import type { AuthenticityPayload } from "@argus/shared/fusion";

export async function runAuthenticityLayer(
  imageBuffer: Buffer,
): Promise<LayerOutcome<AuthenticityPayload>> {
  const t0 = Date.now();
  try {
    const r = await checkAuthenticity(imageBuffer);
    return {
      kind: "done",
      payload: {
        authentic: r.authentic,
        score: r.score,
        verdict: r.verdict,
        source: r.source,
        sha256: r.sha256,
      },
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      kind: "failed",
      reason: `authenticity_failed: ${(err as Error).message}`,
      latencyMs: Date.now() - t0,
    };
  }
}
