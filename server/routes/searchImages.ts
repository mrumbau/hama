// server/routes/searchImages.ts
import type { Request, Response } from "express";

type ImageCandidate = { url: string; source?: string; title?: string };
type SearchImagesBody = {
  query: string;
  threshold?: number; // 0..100
  referenceBase64: string; // dataURL base64
};

type CompareResponse = {
  match: number | null;
  faces_scanned?: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function uniqBy<T>(arr: T[], key: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

async function fetchWithTimeout(url: string, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, 9000);
    if (!r.ok) return null;

    const ct = r.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > 6 * 1024 * 1024) return null;

    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function expandQueries(q: string): string[] {
  const base = q.trim();
  if (!base) return [];
  const parts = base.split(/\s+/).filter(Boolean);
  const oneWord = parts.length === 1;

  const expanded: string[] = [];
  expanded.push(base);
  expanded.push(`"${base}"`);

  if (oneWord) {
    expanded.push(`${base} model`);
    expanded.push(`${base} gundam`);
    expanded.push(`${base} photo`);
    expanded.push(`${base} face`);
  } else {
    expanded.push(`${base} face`);
    expanded.push(`${base} portrait`);
  }

  return uniqBy(expanded, (x) => x.toLowerCase()).slice(0, 6);
}

async function bingImageSearch(query: string, count = 12): Promise<ImageCandidate[]> {
  const key = process.env.BING_KEY || "";
  const endpoint = process.env.BING_ENDPOINT || "https://api.bing.microsoft.com/v7.0/images/search";
  if (!key) return [];

  const u = new URL(endpoint);
  u.searchParams.set("q", query);
  u.searchParams.set("count", String(count));
  u.searchParams.set("safeSearch", "Off");

  const r = await fetchWithTimeout(u.toString(), 9000);
  if (!r.ok) return [];
  const json: any = await r.json();
  const items: any[] = Array.isArray(json?.value) ? json.value : [];
  return items
    .map((it) => ({ url: it?.contentUrl, source: "Bing", title: it?.name }))
    .filter((x) => typeof x.url === "string" && x.url.startsWith("http"));
}

async function gatherCandidates(q: string) {
  const expanded = expandQueries(q);
  const buckets = await Promise.all(expanded.map((qq) => bingImageSearch(qq, 12)));
  const flat = buckets.flat();
  const candidates = uniqBy(flat, (x) => x.url).slice(0, 24);
  return { candidates, expanded };
}

async function compareFace(referenceBase64: string, candidateBase64: string): Promise<CompareResponse> {
  const pyUrl = process.env.PY_COMPARE_URL || "http://127.0.0.1:5002/compare";

  const r = await fetch(pyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reference_base64: referenceBase64,
      candidate_base64: candidateBase64,
    }),
  });

  if (!r.ok) return { match: null };

  const j: any = await r.json().catch(() => ({}));
  const matchNum =
    typeof j?.match === "number"
      ? clamp(Math.round(j.match), 0, 100)
      : typeof j?.similarity === "number"
      ? clamp(Math.round(j.similarity), 0, 100)
      : null;

  const faces = typeof j?.faces_scanned === "number" ? j.faces_scanned : undefined;
  return { match: matchNum, faces_scanned: faces };
}

export async function searchImagesHandler(req: Request, res: Response) {
  const body = req.body as SearchImagesBody;

  const query = String(body?.query || "").trim();
  const referenceBase64 = String(body?.referenceBase64 || "").trim();
  const threshold = clamp(Number(body?.threshold ?? 75), 0, 100);

  if (!query) {
    return res.status(400).json({ warning: "QUERY_EMPTY", results: [], total: 0, aiAnalyzed: false });
  }
  if (!referenceBase64.startsWith("data:")) {
    return res.status(400).json({ warning: "REFERENCE_IMAGE_MISSING", results: [], total: 0, aiAnalyzed: false });
  }

  try {
    console.log(`[ImageSearch] Starting text-based searches for: ${query}`);

    const { candidates, expanded } = await gatherCandidates(query);
    console.log(`[ImageSearch] Raw candidates: ${candidates.length}`);

    const take = candidates.slice(0, 12);
    console.log(`[ImageSearch] Fetching ${take.length} candidate images -> base64...`);

    const base64s = await Promise.all(
      take.map(async (c) => ({
        c,
        b64: await imageUrlToDataUrl(c.url),
      }))
    );

    console.log(`[ImageSearch] Sending ${base64s.filter((x) => x.b64).length} candidates to Python /compare ...`);

    const compared = await Promise.all(
      base64s.map(async (x) => {
        if (!x.b64) {
          return {
            url: x.c.url,
            source: x.c.source || "Bing",
            title: x.c.title || "",
            match: null,
            faces_scanned: 0,
            note: "image_fetch_failed",
          };
        }

        const cmp = await compareFace(referenceBase64, x.b64);
        return {
          url: x.c.url,
          source: x.c.source || "Bing",
          title: x.c.title || "",
          match: cmp.match,
          faces_scanned: cmp.faces_scanned ?? 0,
          note: null as string | null,
        };
      })
    );

    const results = compared
      .map((r) => ({
        ...r,
        passesThreshold: typeof r.match === "number" ? r.match >= threshold : false,
      }))
      .sort((a, b) => {
        const am = typeof a.match === "number" ? a.match : -1;
        const bm = typeof b.match === "number" ? b.match : -1;
        return bm - am;
      });

    return res.json({
      query,
      threshold,
      expandedQueries: expanded,
      results,
      total: results.length,
      aiAnalyzed: true,
      warning: (process.env.BING_KEY || "") ? null : "BING_KEY_MISSING",
    });
  } catch (e: any) {
    return res.status(500).json({
      query,
      threshold,
      results: [],
      total: 0,
      aiAnalyzed: false,
      warning: e?.message || "SERVER_ERROR",
    });
  }
}