/**
 * Reality Defender — deepfake / replay-attack detection.
 *
 * Reality Defender's free tier ships 50 scans/month. To prevent dev work,
 * tests, and accidental refresh-spam from torching the quota, this
 * module defaults to mock mode (RD_MOCK_MODE=true). Operators must set
 * the env var to "false" to call the real API.
 *
 * Mock contract
 *   - Deterministic: same input bytes → same verdict, score, metadata.
 *   - Default verdict: authentic, score=0.99.
 *   - Test-controlled rejections via in-memory hash injection (used by
 *     reality-defender.test.ts to assert the "deepfake" 422 path
 *     without ever hitting the network).
 *
 * Real client (RD_MOCK_MODE=false) is implemented as a structural stub:
 *   POST  /api/files/aws-presigned    → presigned upload URL + requestId
 *   PUT   <presigned URL>             → upload bytes
 *   GET   /api/media/users/{requestId} → poll until status != "ANALYZING"
 *
 * Exact RD endpoints and response shape are pinned at integration time.
 * For Tag 5 the production mode raises a clear "not implemented" error
 * so an unintended toggle does not silently succeed with garbage data.
 *
 * The orchestrator never sees mock vs real — both return the same
 * AuthenticityCheck shape.
 */

import { createHash } from "node:crypto";

import { env } from "../env.js";
import { logger } from "../lib/pino.js";

// ── Public types ────────────────────────────────────────────────────────────

export type AuthenticityVerdict = "authentic" | "deepfake" | "uncertain";

export interface AuthenticityCheck {
  authentic: boolean;
  /** 0–1; higher = more confident the image is real. */
  score: number;
  verdict: AuthenticityVerdict;
  /** Which mode produced this verdict (for the audit trail). */
  source: "mock" | "real";
  /** Image SHA-256 — useful for the audit log + mock injection. */
  sha256: string;
  /** Latency in ms (mock returns ~1, real returns whatever RD takes). */
  latency_ms: number;
}

// ── Mock state ──────────────────────────────────────────────────────────────
//
// Test-only injection map. The mock looks up by sha256 and returns the
// injected verdict if present, else the default authentic verdict.
// `__test_only__` prefix discourages accidental production calls.

const MOCK_OVERRIDES = new Map<string, AuthenticityVerdict>();

export function __test_only__injectMockVerdict(sha256: string, verdict: AuthenticityVerdict): void {
  MOCK_OVERRIDES.set(sha256, verdict);
}

export function __test_only__clearMockVerdicts(): void {
  MOCK_OVERRIDES.clear();
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Compute the deterministic SHA-256 for an image buffer (for audit + mock injection). */
export function imageHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function checkAuthenticity(buf: Buffer): Promise<AuthenticityCheck> {
  const t0 = Date.now();
  const sha256 = imageHash(buf);

  if (env.RD_MOCK_MODE) {
    const overridden = MOCK_OVERRIDES.get(sha256);
    const verdict: AuthenticityVerdict = overridden ?? "authentic";
    const score = verdict === "authentic" ? 0.99 : verdict === "deepfake" ? 0.02 : 0.5;
    logger.debug({ sha256, verdict, mock: true }, "rd: mock verdict");
    return {
      authentic: verdict === "authentic",
      score,
      verdict,
      source: "mock",
      sha256,
      latency_ms: Date.now() - t0,
    };
  }

  return realCheckAuthenticity(buf, sha256, t0);
}

// ── Real client (stub) ──────────────────────────────────────────────────────
//
// Tag 5 ships only the mock. The real client is sketched here so that
// turning RD_MOCK_MODE=false fails loudly at the call site instead of
// silently hitting an unfinished code path. The full implementation
// (presigned-upload + polling) is a Tag 8 concern when Sniper Layer 4
// goes live.

async function realCheckAuthenticity(
  _buf: Buffer,
  sha256: string,
  _t0: number,
): Promise<AuthenticityCheck> {
  // Sketch of the production flow, pinned for Tag 8 implementation:
  //
  //   1. POST `${env.REALITY_DEFENDER_BASE_URL}/api/files/aws-presigned`
  //        headers: { "X-API-KEY": env.REALITY_DEFENDER_API_KEY }
  //        body:    { fileName, fileSize }
  //        → { signedUrl, requestId }
  //
  //   2. PUT signedUrl with the image bytes (Content-Type: <mime>).
  //
  //   3. Poll GET `${env.REALITY_DEFENDER_BASE_URL}/api/media/users/${requestId}`
  //      every 1 s until `status !== "ANALYZING"`. Cap at REALITY_DEFENDER_TIMEOUT_MS.
  //
  //   4. Map RD's response (`status`, `resultsSummary.status`, `score`,
  //      per-model probabilities) to AuthenticityCheck.
  //
  // Until Tag 8: no network call — fail fast so the caller cannot accidentally
  // treat an undefined return value as `authentic`. The error message points
  // directly at the env-var fix.
  logger.warn(
    { sha256 },
    "rd: real-mode invoked but client not yet implemented — set RD_MOCK_MODE=true",
  );
  throw new Error(
    "reality_defender_real_mode_not_implemented_yet (Tag 8). " +
      "Set RD_MOCK_MODE=true to use the deterministic mock.",
  );
}
