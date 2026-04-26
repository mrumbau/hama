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

// ── Real client (Tag 8b — presigned upload + polling) ──────────────────────
//
// Reality Defender's async flow:
//   1. POST /api/files/aws-presigned        → signedUrl + requestId
//   2. PUT  signedUrl (image bytes, mime)
//   3. POLL GET /api/media/users/<requestId> until status != "ANALYZING"
//   4. Map result → AuthenticityCheck
//
// We bound the total wall-clock at REALITY_DEFENDER_TIMEOUT_MS. Inside
// that window we poll every RD_POLL_INTERVAL_MS (1s default) — RD's
// inference latency is typically < 5 s for a face-sized image, so the
// 20 s default is comfortable.

const RD_POLL_INTERVAL_MS = 1_000;

async function realCheckAuthenticity(
  buf: Buffer,
  sha256: string,
  t0: number,
): Promise<AuthenticityCheck> {
  // ── 1. Request a presigned upload URL ────────────────────────────────
  const presignRes = await fetch(`${env.REALITY_DEFENDER_BASE_URL}/api/files/aws-presigned`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": env.REALITY_DEFENDER_API_KEY,
    },
    body: JSON.stringify({ fileName: `${sha256}.jpg` }),
    signal: AbortSignal.timeout(env.REALITY_DEFENDER_TIMEOUT_MS),
  });
  if (!presignRes.ok) {
    const text = await presignRes.text();
    throw new Error(`rd_presign_failed_${presignRes.status}: ${text.slice(0, 200)}`);
  }
  const presign = (await presignRes.json()) as {
    response?: { signedUrl?: string };
    requestId?: string;
  };
  const signedUrl = presign.response?.signedUrl;
  const requestId = presign.requestId;
  if (!signedUrl || !requestId) {
    throw new Error("rd_presign_malformed: missing signedUrl/requestId");
  }

  // ── 2. PUT bytes to S3 ───────────────────────────────────────────────
  const uploadRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: buf,
    signal: AbortSignal.timeout(env.REALITY_DEFENDER_TIMEOUT_MS),
  });
  if (!uploadRes.ok) {
    throw new Error(`rd_upload_failed_${uploadRes.status}`);
  }

  // ── 3. Poll for completion ───────────────────────────────────────────
  const deadline = t0 + env.REALITY_DEFENDER_TIMEOUT_MS;
  let result: RdResult | null = null;
  while (Date.now() < deadline) {
    const pollRes = await fetch(
      `${env.REALITY_DEFENDER_BASE_URL}/api/media/users/${requestId}`,
      {
        method: "GET",
        headers: { "X-API-KEY": env.REALITY_DEFENDER_API_KEY },
        signal: AbortSignal.timeout(env.REALITY_DEFENDER_TIMEOUT_MS),
      },
    );
    if (pollRes.ok) {
      const r = (await pollRes.json()) as RdResult;
      // RD signals "still working" via status === "ANALYZING" at the top
      // level OR resultsSummary.status === "ANALYZING".
      const status = r.status ?? r.resultsSummary?.status;
      if (status && status !== "ANALYZING") {
        result = r;
        break;
      }
    }
    await sleep(RD_POLL_INTERVAL_MS);
  }
  if (!result) {
    throw new Error("rd_poll_timeout: still analysing after deadline");
  }

  // ── 4. Map to AuthenticityCheck ──────────────────────────────────────
  // RD returns top-level status one of:
  //   "FAKE" → deepfake
  //   "AUTHENTIC" → authentic
  //   "ARTIFICIAL" → synthetic / GAN-derived → treat as deepfake
  //   anything else → uncertain
  const rdStatus = result.resultsSummary?.status ?? result.status ?? "UNKNOWN";
  const verdict: AuthenticityVerdict =
    rdStatus === "AUTHENTIC"
      ? "authentic"
      : rdStatus === "FAKE" || rdStatus === "ARTIFICIAL" || rdStatus === "MANIPULATED"
        ? "deepfake"
        : "uncertain";

  // RD reports a fake-confidence; convert to authentic-confidence (1 - fake).
  const fakeScore = result.resultsSummary?.metadata?.finalScore ?? result.finalScore ?? 0;
  const score = verdict === "authentic" ? 1 - fakeScore : fakeScore;

  logger.info(
    { sha256, rd_status: rdStatus, verdict, score, request_id: requestId },
    "rd: real-mode verdict",
  );

  return {
    authentic: verdict === "authentic",
    score,
    verdict,
    source: "real",
    sha256,
    latency_ms: Date.now() - t0,
  };
}

// ── Internal types + helpers ────────────────────────────────────────────────

interface RdResult {
  status?: string;
  finalScore?: number;
  resultsSummary?: {
    status?: string;
    metadata?: {
      finalScore?: number;
    };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
