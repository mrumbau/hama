/**
 * Supabase admin client (service-role).
 *
 * This client BYPASSES RLS by design. It is the orchestrator's identity
 * for Storage uploads, embedded face inserts, and event creation.
 *
 * It must NEVER be exposed to the browser, never logged, never
 * embedded in API responses. The only consumers are server-side
 * helpers (lib/storage.ts, route handlers). Tests get a separate
 * helper that points at the same project but with the anon key, to
 * verify RLS still rejects unauthorised writes.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "../env.js";

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
