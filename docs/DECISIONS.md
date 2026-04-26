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

## D-004 — Bunny Fonts CDN for Tag 2/3 review, self-hosted woff2 by Tag 14

**Date:** 2026-04-25
**What the plan said:** Plan §6 specifies the font choices indirectly
through skill outputs (Outfit / JetBrains Mono / Newsreader / Archivo
Black) but does not pin a hosting strategy.
**What I did:** `client/src/styles/app.css` `@import`s the four font
families from `fonts.bunny.net` (Google-Fonts-compatible CDN with
GDPR-clean delivery — no IP logging, no user tracking). Documented as a
temporary measure: Tag 14 (`impeccable`) replaces this with `@font-face`
on bundled woff2 files copied from Bunny so the production artefact has
zero runtime font dependencies.
**Why:** A self-hosted-from-day-one approach burns four hours on woff2
extraction + subsetting + format negotiation before any token can be
visually reviewed. Bunny's @import works in five lines and lets the user
review tokens in their actual fonts on Tag 2. The runtime CDN dependency
is acceptable during development; it is a Tag 14 polish concern.
**Trade-off:** External request on every cold load until Tag 14. If the
demo is given offline or Bunny is briefly down, the page falls back to
system-ui. The fallback stack in tokens.css is engineered to degrade
gracefully (Outfit → Geist Sans → BlinkMacSystemFont → system-ui).

---

## D-005 — Tag-2 token-preview page is throwaway, replaced Tag 3

**Date:** 2026-04-25
**What the plan said:** Plan §13 Tag 2 gate is "kleine HTML-Demo-Seite
die alle Surfaces, Signal-Farben, Spacing zeigt". User reviews tokens
before any component lands.
**What I did:** Built `client/src/pages/TokenPreview.{tsx,module.css}` as
a real React route rendered from `main.tsx` (instead of a static HTML
page) so hot-reload works during review and the file lives inside the
same lint/build pipeline as the rest of the client. Tag 3 deletes both
files when wouter routing is wired up and `/login` becomes the
unauthenticated landing.
**Why:** A static HTML page would not exercise `tokens.css` through the
Vite asset pipeline, so an issue with `@import "modern-normalize"` or
the Bunny `@import` would only appear later. Rendering through React
also lets the theme toggle run live (`document.documentElement.dataset.theme`)
so the user can flip dark/light without a reload.
**Trade-off:** A few hundred lines of React/CSS that get deleted on Tag 3.
The cost is small; the diff is loud and explicit so the deletion cannot
be missed.

---
