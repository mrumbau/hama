/**
 * Picarta client tests — stubbed fetch.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATABASE_DIRECT_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";
process.env.PICARTA_TIMEOUT_MS = "300";

const { predictLocation, PicartaError } = await import("../src/external/picarta.js");

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("picarta/predictLocation", () => {
  it("maps the ai_* fields to top + topk to alternatives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          ai_country: "United Arab Emirates",
          ai_region: "Dubai",
          ai_city: "Dubai",
          ai_gps: [25.276987, 55.296249],
          ai_confidence: 0.81,
          topk: [
            { country: "United Arab Emirates", region: "Dubai", confidence: 0.81 },
            { country: "Saudi Arabia", region: "Riyadh", confidence: 0.06 },
          ],
        }),
      ),
    );
    const r = await predictLocation("base64imagebody==", 5);
    expect(r.top.country).toBe("United Arab Emirates");
    expect(r.top.confidence).toBeCloseTo(0.81);
    expect(r.top.gps).toEqual([25.276987, 55.296249]);
    expect(r.alternatives).toHaveLength(2);
    expect(r.alternatives[1].confidence).toBeCloseTo(0.06);
    expect(r.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("survives missing optional fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          ai_country: "Germany",
          ai_confidence: 0.5,
          // No region, city, gps, topk.
        }),
      ),
    );
    const r = await predictLocation("img==", 3);
    expect(r.top.country).toBe("Germany");
    expect(r.top.gps).toBeNull();
    expect(r.alternatives).toEqual([]);
  });

  it("turns http error into PicartaError with detail string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(403, { detail: "quota_exhausted" })),
    );
    await expect(predictLocation("img==")).rejects.toMatchObject({
      name: "PicartaError",
      status: 403,
      reason: "quota_exhausted",
    });
    expect(PicartaError).toBeDefined();
  });
});
