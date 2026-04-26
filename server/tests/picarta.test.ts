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
  it("maps ai_* scalars to top + topk_predictions_dict to alternatives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          ai_country: "Spain",
          ai_lat: 40.227,
          ai_lon: -3.646,
          ai_confidence: 0.93,
          city: "Valdemoro",
          province: "Madrid",
          topk_predictions_dict: {
            "1": {
              address: { city: "Valdemoro", country: "Spain", province: "Madrid" },
              confidence: 0.93,
              gps: [40.227, -3.646],
            },
            "2": {
              address: { city: "Bueng Sam Phan", country: "Thailand", province: "Phetchabun" },
              confidence: 0.92,
              gps: [15.87, 100.99],
            },
            "3": {
              address: { city: "Khe Tre", country: "Vietnam", province: "Thua Thien-Hue" },
              confidence: 0.91,
              gps: [16.16, 107.83],
            },
          },
        }),
      ),
    );
    const r = await predictLocation("base64imagebody==", 5);
    expect(r.top.country).toBe("Spain");
    expect(r.top.region).toBe("Madrid");
    expect(r.top.city).toBe("Valdemoro");
    expect(r.top.confidence).toBeCloseTo(0.93);
    expect(r.top.gps).toEqual([40.227, -3.646]);
    // First topk entry is the top-1 itself; we expose entries 2..N as alternatives.
    expect(r.alternatives).toHaveLength(2);
    expect(r.alternatives[0].country).toBe("Thailand");
    expect(r.alternatives[1].country).toBe("Vietnam");
    expect(r.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("survives missing optional fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          ai_country: "Germany",
          ai_confidence: 0.5,
          // No lat/lon/city/province/topk.
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
