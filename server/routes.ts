import type { Express, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";

/* ---------------- ENV ---------------- */

function envStr(name: string, fallback = "") {
  return (process.env[name] ?? fallback).toString().trim();
}

function envNum(name: string, fallback: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

function getSerpApiKey() {
  return envStr("SERPAPI_KEY", "");
}

function getPublicBaseUrl() {
  return envStr("PUBLIC_BASE_URL", "").replace(/\/$/, "");
}

function getFetchTimeoutMs() {
  return envNum("FETCH_TIMEOUT_MS", 45000);
}

function getPyCompareUrl() {
  return envStr("PY_COMPARE_URL", "http://127.0.0.1:8000/compare");
}

function getCompareConcurrency() {
  return envNum("COMPARE_CONCURRENCY", 2);
}

function getThreshold(input: any) {
  const n = Number(input ?? 60);
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 60));
}

/* ---------------- HELPERS ---------------- */

function isHttpUrl(u: string) {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

function uniqStrings(values: string[], max = 9999) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of values) {
    const x = (v || "").trim();
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= max) break;
  }

  return out;
}

function isBlockedUrl(u: string) {
  const s = u.toLowerCase();

  return (
    s.includes("lens.google.com/uploadbyurl") ||
    s.includes("google.com/search") ||
    s.includes("serpapi.com/searches") ||
    s.includes("bing.com/images/search") ||
    s.includes("/favicon") ||
    s.endsWith(".svg")
  );
}

function uniqUrls(urls: string[], max = 9999) {
  return uniqStrings(
    urls.filter((u) => isHttpUrl(u) && !isBlockedUrl(u)),
    max,
  );
}

function isOwnImageUrl(url: string, publicImageUrl: string, publicBaseUrl: string) {
  const a = (url || "").trim().replace(/\/$/, "");
  const b = (publicImageUrl || "").trim().replace(/\/$/, "");
  const base = (publicBaseUrl || "").trim().replace(/\/$/, "");

  if (!a) return true;
  if (a === b) return true;
  if (base && a.startsWith(base + "/uploads/")) return true;
  if (base && a.startsWith(base + "/api/tmp-image/")) return true;

  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const baseUrl = new URL(base);

    if (ua.hostname === ub.hostname && ua.pathname === ub.pathname) return true;
    if (ua.hostname === baseUrl.hostname && ua.pathname.startsWith("/uploads/")) return true;
    if (ua.hostname === baseUrl.hostname && ua.pathname.startsWith("/api/tmp-image/")) return true;
  } catch {}

  return false;
}

function parseDataUrlOrBase64(input: string): {
  contentType: string;
  buf: Buffer;
  dataUrl: string;
} {
  const s = (input || "").trim();
  if (!s) throw new Error("Empty image input");

  const m = s.match(/^data:([^;]+);base64,(.+)$/);
  if (m) {
    const contentType = m[1] || "application/octet-stream";
    const base64 = m[2];
    const buf = Buffer.from(base64, "base64");
    return { contentType, buf, dataUrl: s };
  }

  const contentType = "image/jpeg";
  const buf = Buffer.from(s, "base64");
  return {
    contentType,
    buf,
    dataUrl: `data:${contentType};base64,${s}`,
  };
}

function toDataUrl(buf: Buffer, contentType?: string | null) {
  const ct =
    contentType && contentType.includes("/")
      ? contentType
      : "application/octet-stream";
  return `data:${ct};base64,${buf.toString("base64")}`;
}

/* ---------------- STABLE UPLOAD ---------------- */

function ensureUploadsDir() {
  const dir = path.resolve(process.cwd(), "client", "public", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveStableUpload(buf: Buffer, contentType: string) {
  const ext =
    contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";

  const hash = crypto.createHash("sha1").update(buf).digest("hex");
  const fileName = `${hash}.${ext}`;
  const dir = ensureUploadsDir();
  const full = path.join(dir, fileName);

  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, buf);
  }

  return `/uploads/${fileName}`;
}

/* ---------------- SAFE FETCH ---------------- */

async function safeFetch(url: string, opts: any = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), getFetchTimeoutMs());

  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "ngrok-skip-browser-warning": "true",
        Accept: "*/*",
        ...(opts.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchBuffer(url: string) {
  const r = await safeFetch(url);

  if (!r.ok) {
    throw new Error(`fetch failed ${r.status} for ${url}`);
  }

  const ct = r.headers.get("content-type");
  if (ct && ct.includes("text/html")) {
    throw new Error(`not an image (html) for ${url}`);
  }

  const ab = await r.arrayBuffer();
  return { buf: Buffer.from(ab), contentType: ct };
}

/* ---------------- PYTHON COMPARE ---------------- */

async function compareWithPython(refDataUrl: string, candDataUrl: string): Promise<number> {
  const url = getPyCompareUrl();

  const r = await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      refImage: refDataUrl,
      candidates: [
        {
          id: "cand-1",
          url: candDataUrl,
        },
      ],
    }),
  });

  const j: any = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(`Python compare failed ${r.status} ${JSON.stringify(j)}`);
  }

  const first = Array.isArray(j?.results) ? j.results[0] : null;
  const score = Number(first?.match ?? 0);

  if (!Number.isFinite(score)) return 0;
  return score;
}

/* ---------------- SERPAPI ---------------- */

async function serpApiFetch(params: Record<string, string>) {
  const key = getSerpApiKey();
  if (!key) throw new Error("SERPAPI_KEY missing");

  const api =
    "https://serpapi.com/search.json?" +
    new URLSearchParams({
      ...params,
      api_key: key,
      no_cache: "true",
      output: "json",
    }).toString();

  const r = await safeFetch(api, {
    headers: { Accept: "application/json" },
  });

  const j: any = await r.json().catch(() => ({}));
  const serpErr =
    j?.error ||
    j?.search_metadata?.error ||
    (j?.search_metadata?.status === "Error" ? "SerpAPI status=Error" : "");

  if (!r.ok || serpErr) {
    throw new Error(`SerpAPI error: ${String(serpErr || r.status)}`);
  }

  return j;
}

/* ---------------- RECURSIVE IMAGE URL EXTRACTION ---------------- */

function collectImageUrlsDeep(node: any, out: string[] = []): string[] {
  if (!node) return out;

  if (typeof node === "string") {
    if (isHttpUrl(node)) out.push(node);
    return out;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectImageUrlsDeep(item, out);
    return out;
  }

  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const key = k.toLowerCase();

      if (
        typeof v === "string" &&
        isHttpUrl(v) &&
        (
          key.includes("image") ||
          key.includes("img") ||
          key.includes("thumbnail") ||
          key.includes("original") ||
          key.includes("photo") ||
          key.includes("source") ||
          key.includes("link") ||
          key.includes("url")
        )
      ) {
        out.push(v);
      }

      collectImageUrlsDeep(v, out);
    }
  }

  return out;
}

async function serpapiGoogleLensVisual(imageUrl: string) {
  const j = await serpApiFetch({
    engine: "google_lens",
    url: imageUrl,
    type: "visual_matches",
  });
  return uniqUrls(collectImageUrlsDeep(j), 300);
}

async function serpapiGoogleReverse(imageUrl: string) {
  const j = await serpApiFetch({
    engine: "google_reverse_image",
    image_url: imageUrl,
  });
  return uniqUrls(collectImageUrlsDeep(j), 300);
}

async function serpapiBingReverse(imageUrl: string) {
  const j = await serpApiFetch({
    engine: "bing_reverse_image",
    image_url: imageUrl,
  });
  return uniqUrls(collectImageUrlsDeep(j), 300);
}

/* ---------------- ASYNC POOL ---------------- */

async function asyncPool<T, R>(
  poolLimit: number,
  array: T[],
  iteratorFn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing: Promise<any>[] = [];

  for (let i = 0; i < array.length; i++) {
    const p = Promise.resolve().then(() => iteratorFn(array[i], i));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e: Promise<any> = p.then(() => {
        const idx = executing.indexOf(e);
        if (idx >= 0) executing.splice(idx, 1);
      });
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(ret);
}

/* ---------------- ROUTES ---------------- */

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      serpapiEnabled: !!getSerpApiKey(),
      publicBaseUrl: getPublicBaseUrl(),
      pyCompareUrl: getPyCompareUrl(),
    });
  });

  app.post("/api/search-images", async (req: Request, res: Response) => {
    try {
      const imageBase64 = String(req.body?.imageBase64 || "").trim();
      const threshold = getThreshold(req.body?.threshold);

      if (!imageBase64) {
        return res.status(400).json({ error: "Missing imageBase64" });
      }

      const publicBase = getPublicBaseUrl();
      if (!publicBase) {
        return res.status(400).json({ error: "PUBLIC_BASE_URL missing" });
      }

      const parsed = parseDataUrlOrBase64(imageBase64);
      const stablePath = saveStableUpload(parsed.buf, parsed.contentType);
      const publicImageUrl = `${publicBase}${stablePath}`;

      let visualUrls: string[] = [];
      let reverseUrls: string[] = [];
      let bingUrls: string[] = [];
      const errors: string[] = [];

      try {
        visualUrls = await serpapiGoogleLensVisual(publicImageUrl);
      } catch (e: any) {
        errors.push(`google_lens: ${String(e?.message || e)}`);
      }

      try {
        reverseUrls = await serpapiGoogleReverse(publicImageUrl);
      } catch (e: any) {
        errors.push(`google_reverse_image: ${String(e?.message || e)}`);
      }

      try {
        bingUrls = await serpapiBingReverse(publicImageUrl);
      } catch (e: any) {
        errors.push(`bing_reverse_image: ${String(e?.message || e)}`);
      }

      const candidateUrls = uniqUrls(
        [...visualUrls, ...reverseUrls, ...bingUrls],
        60,
      ).filter((u) => !isOwnImageUrl(u, publicImageUrl, publicBase));

      const scored: { url: string; score: number }[] = [];
      const compareErrors: string[] = [];
      let compared = 0;
      let compareFailed = 0;

      await asyncPool(getCompareConcurrency(), candidateUrls, async (url) => {
        try {
          const { buf, contentType } = await fetchBuffer(url);
          const candDataUrl = toDataUrl(buf, contentType);
          const score = await compareWithPython(parsed.dataUrl, candDataUrl);
          compared++;
          scored.push({ url, score });
        } catch (e: any) {
          compareFailed++;
          compareErrors.push(`${url} :: ${String(e?.message || e)}`);
        }
      });

      scored.sort((a, b) => b.score - a.score);

      let results = scored.filter((x) => x.score >= threshold);
      if (results.length === 0 && scored.length > 0) {
        results = scored.slice(0, Math.min(5, scored.length));
      }

      return res.json({
        ok: true,
        source: "reverse_image_api_only_no_self_match",
        threshold,
        totalCandidates: candidateUrls.length,
        compared,
        compareFailed,
        matched: results.length,
        results,
        topResults: scored.slice(0, 10),
        debug: {
          publicImageUrl,
          visualImages: visualUrls.length,
          reverseImages: reverseUrls.length,
          bingImages: bingUrls.length,
          errors,
          compareErrors,
        },
      });
    } catch (e: any) {
      return res.status(500).json({
        error: String(e?.message || e),
      });
    }
  });
}
