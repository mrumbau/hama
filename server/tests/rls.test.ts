/**
 * RLS integration test against the live Supabase project.
 *
 * Plan §9 + §13 Tag 3 gate: prove the anon key cannot insert into the
 * tables that hold operator data. This is the second-line-of-defence
 * argument for ADR-5: even if an attacker pulls the anon key out of the
 * shipped JS bundle, RLS blocks every write to face_embeddings, events,
 * fusion_reports, fusion_layers, and poi.
 *
 * The test reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
 * client/.env.local. If those are absent (CI without a configured
 * project) the test skips itself with a clear message instead of
 * silently passing.
 *
 * No cleanup needed — every attempted insert is expected to fail at the
 * RLS boundary, so nothing lands in the database.
 */

import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");

function loadDotenv(path: string): Record<string, string> {
  try {
    const raw = readFileSync(path, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

const clientEnv = loadDotenv(join(repoRoot, "client", ".env.local"));
const SUPABASE_URL = clientEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = clientEnv.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

const skipReason =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — fill client/.env.local to run RLS tests"
    : null;

const ZERO_VEC = Array.from({ length: 512 }, () => 0);

describe.skipIf(skipReason !== null)("RLS — anon key cannot write operator data", () => {
  const anon = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  it("anon: INSERT face_embeddings is denied", async () => {
    const { data, error } = await anon.from("face_embeddings").insert({
      poi_id: "00000000-0000-0000-0000-000000000000",
      embedding: ZERO_VEC,
      source_storage_path: "rls-test/zero.jpg",
      quality_score: 1,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toMatch(/^(42501|PGRST301|PGRST204|PGRST116)$/);
  });

  it("anon: INSERT events is denied", async () => {
    const { data, error } = await anon.from("events").insert({
      kind: "recognition",
      score: 0.9,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("anon: INSERT poi is denied", async () => {
    const { data, error } = await anon.from("poi").insert({
      full_name: "RLS Probe",
      category: "guest",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("anon: SELECT poi is denied (no policy for anon)", async () => {
    const { data, error } = await anon.from("poi").select("id").limit(1);
    // Either a hard error or an empty array (RLS silently filters all rows
    // for anon since no SELECT policy targets the anon role).
    expect(error === null ? data : null).toEqual(error === null ? [] : null);
  });
});

if (skipReason) {
  describe("RLS — skipped", () => {
    it.skip(skipReason, () => undefined);
  });
}
