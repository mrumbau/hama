/**
 * SerpAPI client tests — stubbed fetch, no real network.
 *
 * The shape of the response is pinned to what SerpAPI actually returns
 * for `engine=google_lens` so that wire-shape drift would surface
 * here before reaching the orchestrator.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATABASE_DIRECT_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";
process.env.SERPAPI_TIMEOUT_MS = "300";

const { googleLensReverseSearch, SerpApiError } = await import(
  "../src/external/serpapi.js"
);

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("serpapi/google_lens", () => {
  it("parses the visual_matches array and total_results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          search_metadata: { id: "abc-123" },
          search_information: { total_results: 42 },
          visual_matches: [
            {
              position: 1,
              title: "Page title",
              link: "https://example.com/photo",
              source: "example.com",
              thumbnail: "https://serpapi.com/searches/x/thumb.jpg",
            },
          ],
        }),
      ),
    );
    const r = await googleLensReverseSearch("https://supabase.io/storage/x.jpg");
    expect(r.visual_matches).toHaveLength(1);
    expect(r.visual_matches[0].link).toBe("https://example.com/photo");
    expect(r.total_results).toBe(42);
    expect(r.search_id).toBe("abc-123");
    expect(r.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("treats body.error string as a failure even on http 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { error: "API rate limit exceeded" }),
      ),
    );
    await expect(googleLensReverseSearch("https://x.jpg")).rejects.toMatchObject({
      name: "SerpApiError",
      reason: "API rate limit exceeded",
    });
    expect(SerpApiError).toBeDefined();
  });

  it("turns http 4xx/5xx into SerpApiError with reason from body.error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(401, { error: "Invalid API key" }),
      ),
    );
    await expect(googleLensReverseSearch("https://x.jpg")).rejects.toMatchObject({
      name: "SerpApiError",
      status: 401,
      reason: "Invalid API key",
    });
  });

  it("turns AbortError into SerpApiError(reason=timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        await new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
        return new Response("", { status: 200 });
      }),
    );
    await expect(googleLensReverseSearch("https://x.jpg")).rejects.toMatchObject({
      name: "SerpApiError",
      status: 504,
      reason: "timeout",
    });
  });

  it("turns network failure into SerpApiError(reason=unreachable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(googleLensReverseSearch("https://x.jpg")).rejects.toMatchObject({
      name: "SerpApiError",
      status: 502,
      reason: "unreachable",
    });
  });
});
