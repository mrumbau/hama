-- 0003_foreign_keys.sql
-- Hand-written. Adds the FKs to auth.users that Drizzle cannot emit (because
-- auth is Supabase-managed and modelling it via pgSchema() makes drizzle-kit
-- generate a conflicting CREATE TABLE).
--
-- Cascade behaviour:
--   profiles.id           → CASCADE   (deleting a user wipes their profile)
--   poi.created_by        → SET NULL  (preserve poi audit trail)
--   events.operator_id    → SET NULL  (preserve event audit trail)
--   fusion_reports.requested_by → SET NULL  (preserve report attribution)
--
-- Idempotency: drop FK first if present, then add. Allows re-running.

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_id_auth_users_fk;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_auth_users_fk
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE poi
  DROP CONSTRAINT IF EXISTS poi_created_by_auth_users_fk;
ALTER TABLE poi
  ADD CONSTRAINT poi_created_by_auth_users_fk
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_operator_id_auth_users_fk;
ALTER TABLE events
  ADD CONSTRAINT events_operator_id_auth_users_fk
  FOREIGN KEY (operator_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE fusion_reports
  DROP CONSTRAINT IF EXISTS fusion_reports_requested_by_auth_users_fk;
ALTER TABLE fusion_reports
  ADD CONSTRAINT fusion_reports_requested_by_auth_users_fk
  FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
