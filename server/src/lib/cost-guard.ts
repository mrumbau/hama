/**
 * Cost Guard — caps each operator's per-UTC-day spend on paid external
 * services at COST_GUARD_DAILY_EUR (server/.env, default €2.00).
 *
 * Public surface
 *   chargeOrReject(operatorId, service, costEur)
 *      → { allowed: true, totalToday }   layer call may proceed
 *      → { allowed: false, totalToday, capEur }   layer aborts, marks 'failed'
 *
 * Implementation
 *   One row per (operator_id, day_utc, service) in `daily_cost_ledger`.
 *   chargeOrReject is a single SQL statement: an UPSERT inside a CTE
 *   that also reads the operator's full-day total to decide acceptance.
 *   The UPDATE is conditional on the new sum staying ≤ cap, so two
 *   concurrent calls cannot both squeak past the limit.
 *
 * Why a database column and not Redis
 *   The ledger doubles as the audit trail. Operators (and admins via
 *   /api/admin/cost-summary in Tag 14) read their own row to see how
 *   much budget remains. Persistence is required regardless of cache;
 *   adding Redis would be a second source of truth without removing
 *   the SQL one.
 *
 * Service constants
 *   The service column is text-with-CHECK rather than enum so adding
 *   a fourth provider in the future is a one-line migration update.
 */

import { sql } from "drizzle-orm";

import { db } from "../db.js";
import { env } from "../env.js";
import { logger } from "./pino.js";

export type CostGuardService = "serpapi" | "picarta" | "reality_defender";

export interface ChargeOk {
  allowed: true;
  /** Sum across all services for this operator on this UTC day, after the charge. */
  totalToday: number;
  capEur: number;
}

export interface ChargeRejected {
  allowed: false;
  /** What the total *would* have been if the charge had landed. */
  totalToday: number;
  capEur: number;
}

export type ChargeResult = ChargeOk | ChargeRejected;

/**
 * Reserve `costEur` against the operator's daily budget. Returns
 * `{ allowed: false }` if the post-charge total would exceed the cap;
 * the caller must then mark its layer 'failed' with reason
 * 'cost_guard_exceeded' and skip the upstream call.
 *
 * Charging happens atomically — if the post-charge total exceeds the
 * cap, no row is written.
 */
export async function chargeOrReject(
  operatorId: string,
  service: CostGuardService,
  costEur: number,
): Promise<ChargeResult> {
  const cap = env.COST_GUARD_DAILY_EUR;

  // SQL strategy:
  //  1. CTE `current` reads the operator's running total for today.
  //  2. CTE `decision` selects either `current.total + costEur ≤ cap`
  //     → 'allowed', or 'rejected'.
  //  3. The conditional UPSERT increments only when 'allowed'.
  //  4. Final SELECT reports the post-charge total.
  // Single round-trip; no application-side double-read race.

  type Row = {
    allowed: boolean;
    total_today: string; // numeric returns as string from pg
    cap_eur: number;
  } & Record<string, unknown>;

  const result = await db.execute<Row>(sql`
    WITH current_total AS (
      SELECT COALESCE(SUM(spent_eur), 0)::numeric AS total
      FROM daily_cost_ledger
      WHERE operator_id = ${operatorId}
        AND day_utc = (now() AT TIME ZONE 'utc')::date
    ),
    decision AS (
      SELECT (total + ${costEur}::numeric) <= ${cap}::numeric AS allowed,
             total + ${costEur}::numeric AS post_total
      FROM current_total
    ),
    upserted AS (
      INSERT INTO daily_cost_ledger (operator_id, day_utc, service, spent_eur, call_count)
      SELECT ${operatorId}, (now() AT TIME ZONE 'utc')::date, ${service},
             ${costEur}::numeric, 1
      WHERE (SELECT allowed FROM decision)
      ON CONFLICT (operator_id, day_utc, service) DO UPDATE
        SET spent_eur = daily_cost_ledger.spent_eur + EXCLUDED.spent_eur,
            call_count = daily_cost_ledger.call_count + 1,
            updated_at = now()
      RETURNING spent_eur
    )
    SELECT
      d.allowed,
      d.post_total::text AS total_today,
      ${cap}::float8 AS cap_eur
    FROM decision d
  `);

  const row = result.rows[0];
  // SAFETY: WITH-clauses always produce a row from `decision` (single-row CTE).
  if (!row) {
    logger.error({ operatorId, service }, "cost_guard: missing decision row");
    return { allowed: false, totalToday: 0, capEur: cap };
  }

  const totalToday = Number(row.total_today);
  if (row.allowed) {
    return { allowed: true, totalToday, capEur: cap };
  }
  logger.warn(
    { operatorId, service, costEur, totalToday, capEur: cap },
    "cost_guard: rejected — daily cap exceeded",
  );
  return { allowed: false, totalToday, capEur: cap };
}

/**
 * Read-only summary of an operator's spend for the current UTC day.
 * Tag 9 Sniper UI calls this to render the budget headroom indicator.
 */
export async function dailySummary(
  operatorId: string,
): Promise<{ totalToday: number; capEur: number; perService: Record<string, number> }> {
  type Row = { service: string; spent_eur: string } & Record<string, unknown>;
  const result = await db.execute<Row>(sql`
    SELECT service, spent_eur::text AS spent_eur
    FROM daily_cost_ledger
    WHERE operator_id = ${operatorId}
      AND day_utc = (now() AT TIME ZONE 'utc')::date
  `);
  const perService: Record<string, number> = {};
  let totalToday = 0;
  for (const r of result.rows) {
    const eur = Number(r.spent_eur);
    perService[r.service] = eur;
    totalToday += eur;
  }
  return { totalToday, capEur: env.COST_GUARD_DAILY_EUR, perService };
}
