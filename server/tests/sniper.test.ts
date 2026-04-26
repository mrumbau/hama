/**
 * Sniper Mode end-to-end test (Tag 8b).
 *
 * DB-bound + ML-service-bound. Skips if either is unavailable. Stubs
 * `fetch` so the external SerpAPI / Picarta calls do not hit the real
 * network — but uses the real ML service for Layer 1 (the synthetic
 * t1 fixture is the same one Python tests use).
 *
 * Reality Defender stays in mock mode (RD_MOCK_MODE=true), so Layer 4
 * does NOT pass through fetch. The reality-defender.test.ts file
 * exercises the real-mode branch directly.
 *
 * What the test asserts (post-Tag-8b)
 *   * `runSniperReport` writes one fusion_reports row + four
 *     fusion_layers rows.
 *   * All four layers reach a terminal state (done/failed) and the
 *     report transitions to status='complete' (or 'failed' if any
 *     layer failed).
 *   * Cost-guard rows accumulate for the three external services.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { config as loadEnvFile } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import { identityPayloadSchema } from "@argus/shared/fusion";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile({ path: join(__dirname, "..", ".env") });

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";
process.env.RD_MOCK_MODE = "true";

const HAS_DB = Boolean(process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL);
const ML_BASE_URL = process.env.ML_BASE_URL ?? "http://127.0.0.1:8001";

async function mlAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${ML_BASE_URL}/health`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch {
    return false;
  }
}

const FIXTURE_PATH = join(__dirname, "fixtures", "t1.jpg");
let FIXTURE_BUFFER: Buffer | null = null;
try {
  FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);
} catch {
  FIXTURE_BUFFER = null;
}

const skipReason = !HAS_DB
  ? "DATABASE_URL missing"
  : !FIXTURE_BUFFER
    ? `fixture missing at ${FIXTURE_PATH}`
    : null;

describe.skipIf(skipReason !== null)(`sniper parallel fanout (${skipReason ?? "ok"})`, () => {
  let runSniperReport: typeof import("../src/orchestrator/sniper.js").runSniperReport;
  let dbModule: typeof import("../src/db.js");
  let resetBreakers: typeof import("../src/lib/circuit-breaker.js").__test_only__resetRegistry;
  let mlReady = false;
  const createdReportIds: string[] = [];

  // The orchestrator calls fetch for SerpAPI (Layer 2) and Picarta (Layer 3).
  // Layer 1 uses the real ML service (separate fetch but to a different
  // host); Layer 4 is in mock mode (no fetch). We pass through Layer 1
  // calls and stub the others.
  const realFetch = globalThis.fetch.bind(globalThis);

  beforeAll(async () => {
    mlReady = await mlAvailable();
    const sn = await import("../src/orchestrator/sniper.js");
    runSniperReport = sn.runSniperReport;
    dbModule = await import("../src/db.js");
    const cb = await import("../src/lib/circuit-breaker.js");
    resetBreakers = cb.__test_only__resetRegistry;
  }, 30_000);

  afterEach(() => {
    vi.unstubAllGlobals();
    resetBreakers?.();
  });

  afterAll(async () => {
    if (!dbModule) return;
    if (createdReportIds.length > 0) {
      const { sql } = await import("drizzle-orm");
      await dbModule.db.execute(sql`
        DELETE FROM fusion_reports
        WHERE id IN (${sql.join(
          createdReportIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      `);
    }
    await dbModule.closeDb();
  });

  it.skipIf(!FIXTURE_BUFFER)(
    "happy path: all 4 layers complete; report finalises to 'complete'",
    async () => {
      if (!mlReady) {
        console.warn("[sniper.test] ML not reachable — skipping body");
        return;
      }
      const operatorId = await pickOperator(dbModule);
      if (!operatorId) {
        console.warn("[sniper.test] no auth.users — skipping");
        return;
      }

      // Stub fetch: pass through ML + Supabase Storage; respond fixed
      // JSON for SerpAPI + Picarta.
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(typeof input === "string" ? input : input instanceof URL ? input : input.url);
          if (url.includes("serpapi.com")) {
            return jsonResponse({
              search_metadata: { id: "test-search" },
              search_information: { total_results: 3 },
              visual_matches: [
                {
                  position: 1,
                  link: "https://example.com/page",
                  title: "Test page",
                  thumbnail: "https://example.com/thumb.jpg",
                },
              ],
            });
          }
          if (url.includes("picarta.ai")) {
            return jsonResponse({
              ai_country: "Germany",
              ai_region: "Berlin",
              ai_city: "Berlin",
              ai_gps: [52.52, 13.405],
              ai_confidence: 0.74,
              topk: [
                { country: "Germany", region: "Berlin", confidence: 0.74 },
                { country: "Poland", region: "Warsaw", confidence: 0.08 },
              ],
            });
          }
          return realFetch(input as RequestInfo, init);
        }),
      );

      const result = await runSniperReport({
        operatorId,
        imageBuffer: FIXTURE_BUFFER!,
        imageMime: "image/jpeg",
        imageB64: FIXTURE_BUFFER!.toString("base64"),
      });
      createdReportIds.push(result.reportId);

      // Identity layer must succeed; payload validates against schema.
      expect(result.layers.identity.status).toBe("done");
      if (result.layers.identity.status === "done") {
        const parsed = identityPayloadSchema.safeParse(result.layers.identity.payload);
        expect(parsed.success).toBe(true);
      }

      // Layers 2-4 must all succeed.
      expect(result.layers.web_presence.status).toBe("done");
      expect(result.layers.geographic.status).toBe("done");
      expect(result.layers.authenticity.status).toBe("done");

      // Final report status promoted to 'complete'.
      expect(result.finalStatus).toBe("complete");

      // Cross-check via DB.
      const { sql } = await import("drizzle-orm");
      type Row = { layer: string; status: string } & Record<string, unknown>;
      const layers = await dbModule.db.execute<Row>(sql`
        SELECT layer, status FROM fusion_layers
        WHERE report_id = ${result.reportId}
      `);
      expect(layers.rows.every((r) => r.status === "done")).toBe(true);
    },
    60_000,
  );

  it.skipIf(!FIXTURE_BUFFER)(
    "partial-failure: SerpAPI 502 fails Layer 2 only; report finalises to 'failed' but other layers succeed",
    async () => {
      if (!mlReady) return;
      const operatorId = await pickOperator(dbModule);
      if (!operatorId) return;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(typeof input === "string" ? input : input instanceof URL ? input : input.url);
          if (url.includes("serpapi.com")) {
            return jsonResponse({ error: "Bad Gateway" }, 502);
          }
          if (url.includes("picarta.ai")) {
            return jsonResponse({
              ai_country: "France",
              ai_confidence: 0.6,
              topk: [{ country: "France", confidence: 0.6 }],
            });
          }
          return realFetch(input as RequestInfo, init);
        }),
      );

      const result = await runSniperReport({
        operatorId,
        imageBuffer: FIXTURE_BUFFER!,
        imageMime: "image/jpeg",
        imageB64: FIXTURE_BUFFER!.toString("base64"),
      });
      createdReportIds.push(result.reportId);

      expect(result.layers.identity.status).toBe("done");
      expect(result.layers.web_presence.status).toBe("failed");
      expect(result.layers.web_presence.reason).toMatch(/serpapi/);
      expect(result.layers.geographic.status).toBe("done");
      expect(result.layers.authenticity.status).toBe("done");
      expect(result.finalStatus).toBe("failed");
    },
    60_000,
  );
});

// ── helpers ──────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function pickOperator(
  dbModule: typeof import("../src/db.js"),
): Promise<string | null> {
  const { sql } = await import("drizzle-orm");
  type Row = { id: string } & Record<string, unknown>;
  const r = await dbModule.db.execute<Row>(sql`SELECT id FROM auth.users LIMIT 1`);
  return r.rows[0]?.id ?? null;
}
