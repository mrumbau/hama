/**
 * Sniper Mode end-to-end test (Tag 8a).
 *
 * DB-bound + ML-service-bound. Skips if either is unavailable. Uses a
 * tiny synthetic JPEG that the InsightFace model resolves to a
 * recognisable face (the t1 fixture from python/tests/conftest.py
 * reused on the TS side via base64 round-trip).
 *
 * What this test asserts
 *   * `runSniperReport` writes one fusion_reports row + four
 *     fusion_layers rows.
 *   * Layer 1 (identity) reaches status='done' synchronously and its
 *     payload validates against `identityPayloadSchema`.
 *   * Layers 2-4 stay 'pending' (Tag 8b will land them).
 *   * `fusion_reports.status` stays 'processing' because not all
 *     layers are decided yet.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const skipReason =
  !HAS_DB
    ? "DATABASE_URL missing"
    : !FIXTURE_BUFFER
      ? `fixture missing at ${FIXTURE_PATH}`
      : null;

describe.skipIf(skipReason !== null)(`sniper backbone (${skipReason ?? "ok"})`, () => {
  let runSniperReport: typeof import("../src/orchestrator/sniper.js").runSniperReport;
  let dbModule: typeof import("../src/db.js");
  let mlReady = false;
  const createdReportIds: string[] = [];

  beforeAll(async () => {
    mlReady = await mlAvailable();
    const sn = await import("../src/orchestrator/sniper.js");
    runSniperReport = sn.runSniperReport;
    dbModule = await import("../src/db.js");
  }, 30_000);

  afterAll(async () => {
    if (!dbModule || createdReportIds.length === 0) {
      if (dbModule) await dbModule.closeDb();
      return;
    }
    const { sql } = await import("drizzle-orm");
    // Cascade-delete the test reports + their layers.
    await dbModule.db.execute(sql`
      DELETE FROM fusion_reports
      WHERE id IN (${sql.join(
        createdReportIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);
    await dbModule.closeDb();
  });

  it.skipIf(!FIXTURE_BUFFER)(
    "creates report + 4 layers; Layer 1 reaches 'done' synchronously",
    async () => {
      if (!mlReady) {
        console.warn("[sniper.test] ML service not reachable — skipping body");
        return;
      }
      // Find an arbitrary operator id from auth.users (the live env has at
      // least the seeded user).
      const { sql } = await import("drizzle-orm");
      type AuthUserRow = { id: string } & Record<string, unknown>;
      const operatorRes = await dbModule.db.execute<AuthUserRow>(sql`
        SELECT id FROM auth.users LIMIT 1
      `);
      const operatorId = operatorRes.rows[0]?.id;
      if (!operatorId) {
        console.warn("[sniper.test] no auth.users rows — skipping");
        return;
      }

      const result = await runSniperReport({
        operatorId,
        imageBuffer: FIXTURE_BUFFER!,
        imageMime: "image/jpeg",
        imageB64: FIXTURE_BUFFER!.toString("base64"),
      });
      createdReportIds.push(result.reportId);

      expect(result.reportId).toMatch(/^[0-9a-f-]{36}$/);
      if (result.layer1.status === "failed") {
        console.error("[sniper.test] layer1 failed reason:", result.layer1.reason);
      }
      expect(result.layer1.status).toBe("done");

      // Layer 1 payload validates against the shared zod schema.
      if (result.layer1.status === "done") {
        const parsed = identityPayloadSchema.safeParse(result.layer1.payload);
        expect(parsed.success).toBe(true);
      }

      // Drill back into the DB to confirm row-level state.
      type ReportRow = { id: string; status: string } & Record<string, unknown>;
      const rep = await dbModule.db.execute<ReportRow>(sql`
        SELECT id, status FROM fusion_reports WHERE id = ${result.reportId}
      `);
      expect(rep.rows[0]?.status).toBe("processing");

      type LayerRow = { layer: string; status: string } & Record<string, unknown>;
      const layers = await dbModule.db.execute<LayerRow>(sql`
        SELECT layer, status FROM fusion_layers
        WHERE report_id = ${result.reportId}
        ORDER BY layer
      `);
      const byLayer = new Map(layers.rows.map((r) => [r.layer, r.status]));
      expect(byLayer.get("identity")).toBe("done");
      expect(byLayer.get("web_presence")).toBe("pending");
      expect(byLayer.get("geographic")).toBe("pending");
      expect(byLayer.get("authenticity")).toBe("pending");
    },
    60_000,
  );
});
