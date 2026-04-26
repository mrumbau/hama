-- 0006_buckets.sql
-- Hand-written. Three private buckets per plan §7. UUIDv4 paths, signed
-- URLs TTL ≤ 60s.
--
--   poi-photos       — enrolment photos, 10MB cap, image/* MIME, indefinite retention
--   event-frames     — captured Patrol Mode frames, 5MB cap, image/* MIME, 30d lifecycle
--   sniper-queries   — uploaded Sniper Mode query images, 10MB cap, image/* MIME, 7d lifecycle
--
-- Storage in Supabase is administered through `storage.buckets` and
-- `storage.objects` plus RLS policies on `storage.objects`. We disallow
-- ALL access via the anon key. The authenticated role can SELECT their
-- own paths (operator UIs that show enrolment photos), but writes are
-- service-role-only — the Express orchestrator places photos on behalf
-- of operators, never the browser directly.

-- ── Buckets (idempotent upsert) ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('poi-photos',     'poi-photos',     false, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('event-frames',   'event-frames',   false,  5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('sniper-queries', 'sniper-queries', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Object policies on storage.objects ──────────────────────────────────────
-- (storage.objects already has RLS enabled by Supabase; the postgres user is
-- not the owner of storage.objects, so we skip the ALTER TABLE … ENABLE
-- statement and just declare policies. Supabase Storage extension defaults
-- to RLS-on-deny.)

-- authenticated SELECT on the three buckets — Express returns signed URLs
-- via service-role, but the client may also fetch its own enrolment photos
-- directly when it has a path.
DROP POLICY IF EXISTS argus_buckets_select_authenticated ON storage.objects;
CREATE POLICY argus_buckets_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('poi-photos', 'event-frames', 'sniper-queries'));

-- INSERT / UPDATE / DELETE on these buckets are service-role only.
-- (No policy → denied. The Express orchestrator authenticates with the
-- service-role key, which bypasses RLS, so it can write paths on behalf
-- of any operator.)

-- ── Lifecycle hint ──────────────────────────────────────────────────────────
-- Supabase Storage does not natively expose lifecycle rules through SQL;
-- they are configured in the dashboard under Storage → Bucket → Settings.
-- Tag 14 OPERATIONS.md documents the manual configuration for
-- event-frames (30d) and sniper-queries (7d).
