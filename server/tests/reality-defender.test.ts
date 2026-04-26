/**
 * Reality Defender mock + safety tests.
 *
 * The Tag 5 enrolment pipeline must never burn the 50/month free-tier
 * quota during dev or CI. These tests:
 *
 *   1. Default mode (RD_MOCK_MODE=true) returns authentic for any input.
 *   2. The mock is deterministic — same bytes → same hash → same verdict.
 *   3. The test-only `__test_only__injectMockVerdict()` overrides per
 *      sha256 so we can prove the "deepfake" rejection path without a
 *      real API call.
 *   4. RD_MOCK_MODE=false routes to the real client. Until Tag 8 the
 *      real client throws a clear error — verifying the toggle does
 *      what it says.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Stub env BEFORE importing the module under test.
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATABASE_DIRECT_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";
process.env.RD_MOCK_MODE = "true";

const rd = await import("../src/external/reality-defender.js");

const SAMPLE = Buffer.from("argus-rd-test-sample-image-bytes", "utf8");

beforeAll(() => {
  // Sanity: mock mode must be active for the bulk of the suite.
  expect(process.env.RD_MOCK_MODE).toBe("true");
});

afterEach(() => {
  rd.__test_only__clearMockVerdicts();
});

describe("Reality Defender — mock mode (default)", () => {
  it("returns authentic for an arbitrary buffer", async () => {
    const r = await rd.checkAuthenticity(SAMPLE);
    expect(r.authentic).toBe(true);
    expect(r.verdict).toBe("authentic");
    expect(r.score).toBeCloseTo(0.99);
    expect(r.source).toBe("mock");
    expect(r.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces a deterministic verdict per content hash", async () => {
    const a = await rd.checkAuthenticity(SAMPLE);
    const b = await rd.checkAuthenticity(SAMPLE);
    expect(a.sha256).toBe(b.sha256);
    expect(a.verdict).toBe(b.verdict);
    expect(a.score).toBe(b.score);
  });

  it("changes hash when content changes", async () => {
    const a = await rd.checkAuthenticity(SAMPLE);
    const b = await rd.checkAuthenticity(Buffer.concat([SAMPLE, Buffer.from("!")]));
    expect(a.sha256).not.toBe(b.sha256);
  });

  it("respects test-only verdict injection by sha256", async () => {
    const sha = rd.imageHash(SAMPLE);
    rd.__test_only__injectMockVerdict(sha, "deepfake");
    const r = await rd.checkAuthenticity(SAMPLE);
    expect(r.authentic).toBe(false);
    expect(r.verdict).toBe("deepfake");
    expect(r.score).toBeCloseTo(0.02);
  });

  it("supports the uncertain verdict for replay-attack samples", async () => {
    const sha = rd.imageHash(SAMPLE);
    rd.__test_only__injectMockVerdict(sha, "uncertain");
    const r = await rd.checkAuthenticity(SAMPLE);
    expect(r.authentic).toBe(false);
    expect(r.verdict).toBe("uncertain");
    expect(r.score).toBeCloseTo(0.5);
  });
});

describe("Reality Defender — RD_MOCK_MODE=false safety", () => {
  it("real-mode invocation throws a clear not-implemented error", async () => {
    // env.ts caches its parsed environment in a module-level variable. To
    // test the toggle, reset the entire module graph, set the env var,
    // and re-import. The fresh copy of reality-defender.ts re-resolves env.
    vi.resetModules();
    process.env.RD_MOCK_MODE = "false";

    type RdModule = typeof import("../src/external/reality-defender.js");
    const fresh = (await import("../src/external/reality-defender.js")) as RdModule;

    await expect(fresh.checkAuthenticity(SAMPLE)).rejects.toThrow(
      /reality_defender_real_mode_not_implemented_yet/,
    );

    // Restore so the rest of the suite continues in mock mode.
    process.env.RD_MOCK_MODE = "true";
    vi.resetModules();
  });
});
