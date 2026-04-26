/**
 * Supabase JS client (anon key).
 *
 * The anon key is safe to ship to the browser: every table has RLS enabled,
 * and policies restrict reads/writes per the rules in
 * supabase/migrations/0004_rls_policies.sql. Even with the key in DevTools,
 * a malicious actor cannot insert into face_embeddings or update an event
 * they did not create.
 *
 * Storage uploads also go through this client (signed-URL pattern).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Argus client: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required. " +
      "Copy client/.env.example to client/.env.local and fill in.",
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
    storageKey: "argus.auth",
  },
});
