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

## D-006 — Drop `auth.users` cross-schema reference from Drizzle, hand-write FKs

**Date:** 2026-04-25
**What the plan said:** Plan §7 declares FKs from `profiles.id`,
`poi.created_by`, `events.operator_id`, `fusion_reports.requested_by` to
`auth.users(id)`.
**What I did:** Removed `pgSchema("auth").table("users", …)` and all
`.references(() => authUsers.id, …)` chains from `shared/schema.ts`.
Replaced with raw `uuid("operator_id")` etc. The FK constraints + ON DELETE
behaviour are hand-written in `supabase/migrations/0003_foreign_keys.sql`.
**Why:** drizzle-kit emits a `CREATE TABLE "auth"."users" ("id" uuid …)`
when it sees the cross-schema reference, which conflicts with Supabase's
existing `auth.users` table on `db push`. Splitting the FK out into a
hand-written follow-up migration is cleaner than post-processing the
generated SQL.
**Trade-off:** The Drizzle TypeScript layer no longer knows that
`operatorId` is FK-bound to `auth.users`. This is a documentation loss
only — the database still enforces it, and the only consumer of the
relationship is the SQL itself.

---

## D-007 — Migration runner is hand-written `scripts/db-push.ts`, not `drizzle-kit migrate`

**Date:** 2026-04-25
**What the plan said:** Plan §13 Tag 3 implies `drizzle-kit migrate`
("`001_schema.sql` generated", "`supabase db push`").
**What I did:** Wrote a small idempotent runner in `scripts/db-push.ts`
that applies every `supabase/migrations/*.sql` file in lexicographic
order, tracking applied filenames + sha256 in a `__argus_migrations`
journal table. Re-running is a no-op; content drift on an already-applied
file fails fast.
**Why:** Half of the migrations are hand-written (extensions, FK to
auth.users, RLS policies, HNSW index, storage buckets) and drizzle-kit
only owns the schema diff. Two journals fighting each other is worse
than one runner that owns everything.
**Trade-off:** No automatic down-migrations (the runner is forward-only).
For a uni project this is fine — the demo's reset path is "drop the
Supabase project, re-create, re-run db-push.ts". The migration set
takes ~3 seconds to re-apply against a fresh Supabase project.

---

## D-008 — `pg.Pool` connects with `ssl: { rejectUnauthorized: false }`

**Date:** 2026-04-25
**What the plan said:** Nothing explicit; plan §9 lists three Supabase
keys and rate-limit posture but does not pin TLS verification mode.
**What I did:** `server/src/db.ts` constructs the pool with
`ssl: { rejectUnauthorized: false }`. Connection still uses TLS, but the
client does not verify the certificate chain.
**Why:** Supabase's pooler ships an intermediate cert chain that Node's
default trust store does not include, and bundling Supabase's CA in-repo
is brittle (rotates). Without this setting, the server fails to reach
Postgres on Node 20+/25 with `self-signed certificate in certificate
chain`. The connection string already carries the password, so a passive
MITM cannot decrypt traffic.
**Trade-off:** An active MITM with the ability to sit between the server
and Supabase could, in theory, intercept traffic. In our deployment
topology (server runs in Docker, talks to Supabase over the public
internet), this is the same threat profile as `psql` against the same
project. Tag 14 SECURITY.md documents the choice and the path to
strict verification (bundle a CA cert in production builds).

---

## D-009 — Auth verification migrated from HS256 + SUPABASE_JWT_SECRET to JWKS + ES256/RS256

**Date:** 2026-04-25 (same-day fix-forward of the Tag 3 implementation)
**What the plan said:** Plan §13 Tag 3 referenced "JWT-Middleware"
without pinning the algorithm. ADR-2 consequences mentioned
`SUPABASE_JWT_SECRET` as the verification key. The Tag 3 commit
implemented HS256 against `SUPABASE_JWT_SECRET` using `jsonwebtoken`.
**What I did:** Discarded the HS256 path. Rewrote
`server/src/auth/jwt.ts` to use `jose.jwtVerify` against
`createRemoteJWKSet` pointed at
`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, with `algorithms:
["RS256", "ES256"]`. Made `SUPABASE_JWT_SECRET` optional in `env.ts`.
Replaced `jsonwebtoken` with `jose` in `server/package.json`. Rewrote
`server/tests/jwt.test.ts` to generate a local ES256 keypair, expose
the public half via `createLocalJWKSet`, and inject it via a new
`setJwksForTests()` hook on the middleware.
**Why:** Supabase rotated to JWT Signing Keys (asymmetric, ES256
default, RS256 optional) in 2024-Q4. The legacy HS256 secret is still
dashboard-visible but no longer signs new access tokens. Live smoke
test of the Tag 3 middleware returned 401 for every real session
token; standalone `jwtVerify` against the JWKS picked up the correct
kid and accepted the same tokens — proving the verification key, not
the logic, was the problem. See ADR-9.
**Trade-off:** First request after a cold server start triggers a
JWKS fetch (~50–200 ms over the public internet). jose's built-in
cache makes this a one-time cost per server boot. The 30 s cooldown
on unknown kids means an upstream key rotation costs up to one
cooldown window of 401s for inflight users — acceptable for an
operator system whose users are already signed in via persistent
Supabase sessions and will retry. The legacy secret remains in
`env.ts` as optional only because deleting it would force a fresh
`.env` rotation for every developer with no benefit.

**Verification (curl /api/me, post-fix)**

```
$ curl /api/me -H "Authorization: Bearer ${ACCESS_TOKEN}"
{"sub":"2ec6c43e-f378-4295-b39e-2d3a30bbee0f",
 "email":"hawramimohammed@gmail.com",
 "role":"authenticated"}
HTTP_CODE: 200
```

9/9 server tests passing (5 JWT via local ES256 JWKS, 4 RLS via live
Supabase).

---
