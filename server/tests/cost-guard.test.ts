/**
 * Cost-guard tests.
 *
 * DB-bound. Skips automatically if `DATABASE_URL` is missing — the
 * pure-logic surface (decision math) is inside the SQL CTE in
 * lib/cost-guard.ts, so testing without a real DB would only verify
 * Drizzle wiring.
 *
 * Strategy
 *   * Generate a random uuid per test run as the "operator" so concurrent
 *     CI runs don't collide. The `daily_cost_ledger.operator_id_fkey`
 *     to auth.users would normally reject this — for the test we
 *     temporarily disable session_replication_role triggers so the
 *     FK doesn't fire, run the test, and restore.
 *
 *     This is the standard Drizzle-vs-RLS workaround used in
 *     server/tests/rls.test.ts. The real RLS check is exercised
 *     end-to-end in sniper.test.ts via the real /api/sniper/run path.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnvFile } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile({ path: join(__dirname, "..", ".env") });

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key-very-long-min-40-chars-1234";
process.env.SERPAPI_KEY ??= "serpapi-test-key-must-be-long-enough";
process.env.PICARTA_API_KEY ??= "picarta-test-key";
process.env.REALITY_DEFENDER_API_KEY ??= "reality-defender-test-key-min-20-chars";
// Tight cap so a couple of charges saturate it.
process.env.COST_GUARD_DAILY_EUR = "0.50";

const HAS_DB = Boolean(process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL);

describe.skipIf(!HAS_DB)("cost-guard", () => {
  let chargeOrReject: typeof import("../src/lib/cost-guard.js").chargeOrReject;
  let dailySummary: typeof import("../src/lib/cost-guard.js").dailySummary;
  let dbModule: typeof import("../src/db.js");

  // Fresh operator id per test run keeps a stable starting balance of 0.
  const operatorId = randomUUID();

  beforeAll(async () => {
    const cg = await import("../src/lib/cost-guard.js");
    chargeOrReject = cg.chargeOrReject;
    dailySummary = cg.dailySummary;
    dbModule = await import("../src/db.js");

    // Seed: insert a placeholder row in auth.users so the FK from
    // daily_cost_ledger doesn't reject. Use a service-role-only INSERT
    // bypassing RLS via the direct pool.
    const { sql } = await import("drizzle-orm");
    await dbModule.db.execute(sql`
      INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
      VALUES (${operatorId}, ${`cg-test-${operatorId}@argus.test`}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now())
      ON CONFLICT (id) DO NOTHING
    `);
  }, 30_000);

  afterAll(async () => {
    if (!dbModule) return;
    const { sql } = await import("drizzle-orm");
    // Cascade clears the ledger via the FK ON DELETE CASCADE.
    await dbModule.db.execute(sql`DELETE FROM auth.users WHERE id = ${operatorId}`);
    await dbModule.closeDb();
  });

  it("allows a charge below the cap", async () => {
    const r = await chargeOrReject(operatorId, "serpapi", 0.1);
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.totalToday).toBeCloseTo(0.1, 4);
      expect(r.capEur).toBeCloseTo(0.5, 4);
    }
  });

  it("rejects a charge that would exceed the cap, leaving the ledger untouched", async () => {
    // The previous test consumed 0.1 of the 0.5 cap. A 0.5-€ charge would
    // push past.
    const before = await dailySummary(operatorId);
    const r = await chargeOrReject(operatorId, "picarta", 0.5);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      // post-charge would have been 0.6 — over the cap.
      expect(r.totalToday).toBeCloseTo(0.6, 4);
    }
    const after = await dailySummary(operatorId);
    expect(after.totalToday).toBeCloseTo(before.totalToday, 4);
    // 'picarta' must NOT have been written.
    expect(after.perService["picarta"]).toBeUndefined();
  });

  it("multiple small charges accumulate per service", async () => {
    await chargeOrReject(operatorId, "serpapi", 0.05);
    await chargeOrReject(operatorId, "reality_defender", 0.05);
    const summary = await dailySummary(operatorId);
    expect(summary.totalToday).toBeCloseTo(0.2, 4);
    expect(summary.perService["serpapi"]).toBeCloseTo(0.15, 4);
    expect(summary.perService["reality_defender"]).toBeCloseTo(0.05, 4);
    expect(summary.capEur).toBeCloseTo(0.5, 4);
  });
});
