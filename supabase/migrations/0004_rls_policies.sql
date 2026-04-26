-- 0004_rls_policies.sql
-- Hand-written. Plan §9: RLS is the second line of defence. The Express
-- orchestrator authenticates with the service-role key and bypasses RLS,
-- so RLS protects against (a) the anon key reaching the wrong table, and
-- (b) a compromised authenticated user trying to escalate privileges
-- through the supabase-js client.
--
-- Policy summary
--   profiles          authenticated SELECT all · UPDATE own only · INSERT only via trigger
--   poi               authenticated SELECT not-deleted · admin SELECT all · INSERT/UPDATE/DELETE service-role
--   face_embeddings   authenticated SELECT all · INSERT/UPDATE/DELETE service-role only
--   events            authenticated SELECT all · UPDATE only by operator_id=self or admin · INSERT/DELETE service-role
--   fusion_reports    authenticated SELECT own · admin SELECT all · INSERT/UPDATE service-role
--   fusion_layers     follow fusion_reports — SELECT if you can SELECT the parent report
--
-- Helper: is_admin() reads the caller's role from profiles.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_authenticated ON profiles;
CREATE POLICY profiles_select_authenticated ON profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = 'operator'); -- can't promote self

-- INSERT and DELETE on profiles are not allowed for any non-service-role
-- caller. profiles rows are created by the on-signup trigger (below).

-- Trigger: create a profile row whenever Supabase Auth creates a user.
-- Uses raw_user_meta_data->>'display_name' if set, else the email local-part.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    ),
    'operator'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── poi ─────────────────────────────────────────────────────────────────────
ALTER TABLE poi ENABLE ROW LEVEL SECURITY;
ALTER TABLE poi FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poi_select_active ON poi;
CREATE POLICY poi_select_active ON poi
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_admin());

-- INSERT / UPDATE / DELETE: service-role only (no policy → denied).

-- ── face_embeddings ─────────────────────────────────────────────────────────
ALTER TABLE face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_embeddings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS face_embeddings_select_authenticated ON face_embeddings;
CREATE POLICY face_embeddings_select_authenticated ON face_embeddings
  FOR SELECT TO authenticated
  USING (true);

-- INSERT / UPDATE / DELETE: service-role only.

-- ── events ──────────────────────────────────────────────────────────────────
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_authenticated ON events;
CREATE POLICY events_select_authenticated ON events
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS events_update_assigned_or_admin ON events;
CREATE POLICY events_update_assigned_or_admin ON events
  FOR UPDATE TO authenticated
  USING (operator_id = auth.uid() OR public.is_admin())
  WITH CHECK (operator_id = auth.uid() OR public.is_admin());

-- INSERT / DELETE: service-role only.

-- ── fusion_reports ──────────────────────────────────────────────────────────
ALTER TABLE fusion_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE fusion_reports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fusion_reports_select_own_or_admin ON fusion_reports;
CREATE POLICY fusion_reports_select_own_or_admin ON fusion_reports
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_admin());

-- INSERT / UPDATE: service-role only (orchestrator writes the report row +
-- updates its status). No DELETE policy.

-- ── fusion_layers ───────────────────────────────────────────────────────────
ALTER TABLE fusion_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fusion_layers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fusion_layers_select_via_report ON fusion_layers;
CREATE POLICY fusion_layers_select_via_report ON fusion_layers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fusion_reports r
      WHERE r.id = fusion_layers.report_id
        AND (r.requested_by = auth.uid() OR public.is_admin())
    )
  );

-- INSERT / UPDATE: service-role only.

-- ── Realtime publication ────────────────────────────────────────────────────
-- Add the tables that the operator UI subscribes to via supabase.channel().
-- Idempotent: only add a table if it isn't already a member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE events';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'fusion_layers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE fusion_layers';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'fusion_reports'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE fusion_reports';
  END IF;
END $$;
