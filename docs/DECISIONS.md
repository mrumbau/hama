# Argus — Decision Log

Live log of every deviation from the original plan and every per-day
decision that an examiner might ask "why?" about. New entries are appended
at the end. Format defined in plan §15.

For accepted-and-frozen architecture decisions, see
[ARCHITECTURE.md](./ARCHITECTURE.md).

---

## D-001 — Discarded predecessor codebase, retained only stack scaffolding

**Date:** 2026-04-25
**What the plan said:** §1 mandates radical overwrite, retain only top-level
`client/`, `server/`, `python/` directory names.
**What I did:** `git tag pre-argus-snapshot` on the inherited state, then
removed every file from §1's deletion list in a single commit. Created a
fresh pnpm-workspace structure (`client/`, `server/`, `shared/`) plus
`python/`, `supabase/`, `docs/`, `tests/`, `scripts/` directories.
**Why:** See ADR-0. Three incompatible Python servers, ~50 unused npm
dependencies, live secrets in `.env`, ghost imports on `@shared/schema` —
incremental cleanup would have cost more than a rewrite.
**Trade-off:** The single working pipeline (SerpAPI reverse image search)
is gone for now; it is reborn as Sniper Mode Layer 2 starting Tag 8, in
cleaner form and against the same SerpAPI engines.

---

## D-002 — Drop Layer 5 (Scene Context / Vision LLM) from Sniper Mode

**Date:** 2026-04-25
**What the plan said:** Sniper Mode has 5 layers, Layer 5 = Anthropic Claude
or Google Gemini Vision API for scene context (clothing, setting, time of
day, weather).
**What I did:** Sniper Mode now has **4 layers**: Identity, Web Presence,
Geographic, Authenticity. Schema enums, orchestrator fan-out, and UI grid
are dimensioned for 4. The string `"scene"` does not appear in
`shared/fusion.ts`.
**Why:** User decision: Layer 5 was specified as "Bonus" in the original
prompt, did not contribute identity-relevant signal (it described the photo
content, not the person), and would have introduced a fifth external
dependency with its own latency and cost profile. Removing it tightens the
defence story to "four independent identity-bearing signals fused".
**Trade-off:** Less surface area and less to demo. The 4-layer story is
crisper than a 5-layer story would have been, especially given Layer 5
contributed _context_ not _identity_. The Scene Context idea is preserved
in `docs/DECISIONS.md` as a future extension.

---

## D-003 — Drop FaceCheck.ID from Layer 2 (Web Presence), SerpAPI only

**Date:** 2026-04-25
**What the plan said:** Layer 2 = FaceCheck.ID API ($0.30/search, BTC
payment, polling-based) **plus** SerpAPI (Google Lens + Reverse + Bing
Reverse).
**What I did:** Layer 2 implemented as SerpAPI only. No `external/facecheck.ts`
will be written. Cost-guard logic still applies to SerpAPI quota.
**Why:** User decision: BTC payment workflow has unpredictable lead time,
and per-search cost made an unattended demo financially risky. SerpAPI's
three engines (Lens, Reverse Image, Bing Reverse) already saturate the
"public web presence" signal for the demo dataset.
**Trade-off:** Layer 2 has slightly less recall than the FaceCheck-augmented
version would have had — FaceCheck specifically aggregates social media
profile photos that Lens often misses. For the university demo using
controlled POI photos this gap is invisible. Note in the defence: "Layer 2
is API-shaped — adding FaceCheck is a 50-line `external/facecheck.ts` plus
one orchestrator entry; the architecture does not need to change."

---
