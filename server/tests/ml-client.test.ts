/**
 * ml-client tests.
 *
 * Verifies the wire-shape against fixed responses (no real ML server).
 * Uses vi.stubGlobal to stub fetch with deterministic JSON.
 *
 * Cases
 *  1. happy /quality + /detect + /embed → typed object
 *  2. 422 with detail.error → MlError with status=422 and reason
 *  3. timeout → MlError with status=504 and reason="ml_timeout"
 *  4. network failure → MlError with status=502 and reason="ml_unreachable"
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATABASE_DIRECT_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";
// Tight timeout so the timeout case fails fast.
process.env.ML_TIMEOUT_MS = "300";

const { ml, MlError } = await import("../src/lib/ml-client.js");

beforeAll(() => {
  // sanity check
  expect(typeof ml.embed).toBe("function");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ml-client", () => {
  it("returns typed quality response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          passes: true,
          reasons: [],
          metrics: { face_count: 1, face_size_px: 200, blur_var: 200, pose_yaw_deg: -2 },
          face: {
            bbox: { x: 10, y: 10, w: 200, h: 200 },
            det_score: 0.95,
            yaw_deg: -2,
            blur_var: 200,
            landmarks: [],
          },
        }),
      ),
    );
    const r = await ml.quality("imgb64");
    expect(r.passes).toBe(true);
    expect(r.face?.det_score).toBe(0.95);
  });

  it("returns typed embed response (512-D)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          face: {
            bbox: { x: 0, y: 0, w: 100, h: 100 },
            det_score: 0.9,
            yaw_deg: 0,
            blur_var: 100,
            landmarks: [],
          },
          embedding: Array.from({ length: 512 }, (_, i) => i / 512),
          embedding_dim: 512,
        }),
      ),
    );
    const r = await ml.embed("imgb64");
    expect(r.embedding_dim).toBe(512);
    expect(r.embedding).toHaveLength(512);
  });

  it("turns 422 detail.error into MlError(reason=no_face)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(422, { detail: { error: "no_face" } })),
    );
    await expect(ml.embed("imgb64")).rejects.toMatchObject({
      name: "MlError",
      status: 422,
      reason: "no_face",
    });
    expect(MlError).toBeDefined();
  });

  it("turns network failure into MlError(reason=ml_unreachable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(ml.detect("imgb64")).rejects.toMatchObject({
      name: "MlError",
      status: 502,
      reason: "ml_unreachable",
    });
  });

  it("turns AbortError into MlError(reason=ml_timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init?: RequestInit) => {
        // Wait until the controller aborts, then throw the AbortError fetch
        // would naturally raise.
        await new Promise<void>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
          // Never resolve on its own — the timeout in ml-client will abort.
          setTimeout(resolve, 5_000);
        });
        return new Response("", { status: 200 });
      }),
    );
    await expect(ml.embed("imgb64")).rejects.toMatchObject({
      name: "MlError",
      status: 504,
      reason: "ml_timeout",
    });
  });
});
