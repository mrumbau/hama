/**
 * SerpAPI client — Google Lens reverse-image search.
 *
 * Used by Sniper Layer 2 (Web Presence). One call per Sniper run with
 * `engine=google_lens` — Google Lens returns visual matches (URLs +
 * thumbnails + titles) which is the most useful single signal for
 * "where else does this face appear on the public web". Bing / Google
 * Reverse can be added later as additional engines if cost allows.
 *
 * Authentication: API key in query string. Per SerpAPI's docs the key
 * never appears in the response, so it's safe to log the URL minus the
 * key.
 *
 * Image input: SerpAPI fetches the image server-side from a URL we
 * pass. The Sniper query lives in the private `sniper-queries` bucket;
 * we generate a 5-minute signed URL just before the call. Even if the
 * URL leaks it expires before any abuser can re-fetch.
 */

import { env } from "../env.js";
import { logger } from "../lib/pino.js";

export interface SerpApiVisualMatch {
  position: number;
  title?: string;
  link: string;
  source?: string;
  source_icon?: string;
  thumbnail?: string;
}

export interface SerpApiSearchResult {
  visual_matches: SerpApiVisualMatch[];
  /** Total count reported by SerpAPI (may be larger than visual_matches.length). */
  total_results: number;
  search_id: string;
  latency_ms: number;
}

export class SerpApiError extends Error {
  readonly status: number;
  readonly reason: string;
  constructor(status: number, reason: string, message?: string) {
    super(message ?? `serpapi failed: ${status} ${reason}`);
    this.name = "SerpApiError";
    this.status = status;
    this.reason = reason;
  }
}

/**
 * Run a Google Lens reverse-image search.
 *
 * `imageUrl` must be publicly fetchable for ≥ a few seconds — typically
 * a Supabase Storage signed URL with TTL ≥ 60 s. SerpAPI's fetcher
 * retries internally on transient errors but won't wait on a URL that
 * expires mid-fetch.
 */
export async function googleLensReverseSearch(imageUrl: string): Promise<SerpApiSearchResult> {
  const t0 = Date.now();
  const url = new URL(`${env.SERPAPI_BASE_URL}/search`);
  url.searchParams.set("engine", "google_lens");
  url.searchParams.set("url", imageUrl);
  url.searchParams.set("api_key", env.SERPAPI_KEY);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.SERPAPI_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON body — bubble up as a generic upstream error.
      throw new SerpApiError(res.status, "non_json_response", text.slice(0, 200));
    }

    if (!res.ok) {
      const errMsg =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `http_${res.status}`;
      throw new SerpApiError(res.status, errMsg);
    }

    if (
      !body ||
      typeof body !== "object" ||
      ("error" in body && typeof (body as { error: unknown }).error === "string")
    ) {
      const reason =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : "missing_visual_matches";
      throw new SerpApiError(200, reason);
    }

    const obj = body as {
      visual_matches?: SerpApiVisualMatch[];
      search_information?: { total_results?: number };
      search_metadata?: { id?: string };
    };

    return {
      visual_matches: obj.visual_matches ?? [],
      total_results: obj.search_information?.total_results ?? obj.visual_matches?.length ?? 0,
      search_id: obj.search_metadata?.id ?? "",
      latency_ms: Date.now() - t0,
    };
  } catch (err) {
    if (err instanceof SerpApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new SerpApiError(504, "timeout", `timed out after ${env.SERPAPI_TIMEOUT_MS}ms`);
    }
    logger.error({ err }, "serpapi: unexpected failure");
    throw new SerpApiError(502, "unreachable", (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
