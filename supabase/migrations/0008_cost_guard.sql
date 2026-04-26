-- 0008_cost_guard.sql
-- Tag 8 (ADR-6, Sniper Mode fanout). Per-operator daily-spend ledger
-- enforced before every external API call (SerpAPI, Picarta, Reality
-- Defender). The orchestrator increments this row inside its
-- chargeOrReject() helper; if the post-increment total for the
-- operator+day would exceed COST_GUARD_DAILY_EUR (server/.env), the
-- transaction rolls back and the layer that requested the spend is
-- marked 'failed' with reason='cost_guard_exceeded'.
--
-- Per-service rows let the OPERATIONS.md dashboard query show
-- "you spent 0.30 € on SerpAPI today, 1.10 € on Picarta", which is
-- the audit story §10 of the plan calls for.
--
-- Day boundary is UTC. Picked to match the external services'
-- billing cycles (all three documented as UTC) and to avoid
-- timezone drift across operator locations.

CREATE TABLE IF NOT EXISTS daily_cost_ledger (
  operator_id uuid       NOT NULL,
  day_utc     date       NOT NULL,
  service     text       NOT NULL,
  spent_eur   numeric(8, 4) NOT NULL DEFAULT 0,
  call_count  integer    NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, day_utc, service)
);

-- Enforced check service is one of the known integrations.
ALTER TABLE daily_cost_ledger
  DROP CONSTRAINT IF EXISTS daily_cost_ledger_service_check;
ALTER TABLE daily_cost_ledger
  ADD CONSTRAINT daily_cost_ledger_service_check
  CHECK (service IN ('serpapi', 'picarta', 'reality_defender'));

-- FK to auth.users with ON DELETE CASCADE — when an operator account
-- is removed, their cost ledger goes with them.
ALTER TABLE daily_cost_ledger
  DROP CONSTRAINT IF EXISTS daily_cost_ledger_operator_id_fkey;
ALTER TABLE daily_cost_ledger
  ADD CONSTRAINT daily_cost_ledger_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Hot-path query: SUM(spent_eur) WHERE operator_id=? AND day_utc=?.
CREATE INDEX IF NOT EXISTS daily_cost_ledger_operator_day_idx
  ON daily_cost_ledger (operator_id, day_utc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Operator UI may want to read its own current daily spend (Tag 9
-- Sniper page can show the Cost-Guard headroom). Service role writes.

ALTER TABLE daily_cost_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_cost_ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_cost_ledger_select_own_or_admin ON daily_cost_ledger;
CREATE POLICY daily_cost_ledger_select_own_or_admin ON daily_cost_ledger
  FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR public.is_admin());

-- INSERT / UPDATE / DELETE: service-role only (orchestrator-driven).
