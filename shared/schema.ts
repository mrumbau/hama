// Drizzle schema is the single source of truth for the Postgres schema.
// `pnpm --filter @argus/server db:generate` emits SQL into supabase/migrations/.
// RLS policies are hand-written in supabase/migrations/002_rls_policies.sql
// because Drizzle does not model row-level security.
//
// Day 3 will fill this file. Day 1 only places the marker so imports resolve.

export const SCHEMA_VERSION = "0.0.0-day1-stub";
