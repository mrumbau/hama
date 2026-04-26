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

## D-010 — Reality Defender mock-by-default + injectable verdicts (cost guard)

**Date:** 2026-04-25
**What the plan said:** Plan §3 enrolment includes a Reality Defender
authenticity gate. Plan §9 caps Reality Defender at "max 10/min global
(50/Monat-Free-Tier)" and §11 lists "no Cost-Guard" as Fusion-Slop.
**What the user asked:** Build an `RD_MOCK_MODE=true` toggle so the
Tag 5 enrolment dev-loop and CI never burn the 50-scan/month free
quota. Mock returns deterministic authentic verdicts.
**What I did:**

- `RD_MOCK_MODE` Zod env var, **default true**. The user must set
  `RD_MOCK_MODE=false` explicitly to call the real Reality Defender API.
- `server/src/external/reality-defender.ts` — mock first, real second.
  - Mock: deterministic per `sha256(image_bytes)`. Default verdict
    `authentic, score=0.99`. Test-only `__test_only__injectMockVerdict()`
    overrides per hash so the test suite asserts the deepfake-rejection
    path without ever opening a socket.
  - Real client: structural stub. Fails fast with a clear
    `reality_defender_real_mode_not_implemented_yet` error if the
    toggle is flipped pre-Tag 8. The error message points at
    `RD_MOCK_MODE=true` so an accidental flip in dev surfaces the
    fix in 5 seconds.
- `AuthenticityCheck` interface includes `source: "mock" | "real"` so
  every audit-log entry carries which path produced the verdict —
  defensible in the oral defence ("we logged that this enrolment used
  the mock, here's the row").
- 6 unit tests in `tests/reality-defender.test.ts`: default authentic;
  determinism per hash; hash-changes-with-content; per-sha verdict
  injection (deepfake); uncertain verdict; real-mode safety throw
  (with vi.resetModules to re-evaluate the env cache).
  **Why:** The free tier is a hard 50/month ceiling. Without a default-mock
  guard, a single CI run that hits this code path drains the budget.
  Mock-by-default with explicit opt-out matches the Tag-1 secrets-rotation
  posture: secure default, opt-in danger.
  **Trade-off:** The real Reality Defender client is a Tag-8 commitment,
  not Tag-5. The Tag-5 enrolment pipeline therefore never proves the
  real upload+poll-by-requestId integration. Mitigation: a clear `// Sketch
of the production flow, pinned for Tag 8 implementation` block in
  `reality-defender.ts` documenting the exact endpoints and shape, so the
  Tag 8 author has a concrete interface to fill in.

**Verification (live smoke test, post-implementation)**

```
$ curl -X POST /api/poi/<id>/photos -F "image=@single-face.jpg"
HTTP_CODE: 201
embedding_id: 1a9ebb27-2681-4dc7-80a7-7ecb81173f6a
authenticity: {"verdict":"authentic","score":0.99,"source":"mock"}
storage_path: 2e14b71a-9e6c-42c9-9ee1-56a0918a8e18.jpg
quality.face_size_px: 102
```

DB row: `face_embeddings.vector_dims(embedding) = 512`,
`quality_score = 0.773`, `authenticity_score = 0.99`.

---

## D-011 — POI photo upload via multipart-to-Express (not signed-URL-direct-to-Storage)

**Date:** 2026-04-25
**What the plan said:** ADR-2 consequence: "File uploads go directly
from browser to Supabase Storage (signed upload URL pattern) and
never traverse Express." Plan §3 contradicts itself by suggesting the
pipeline is `POST /api/poi/:id/photos (multipart)`.
**What I did:** Followed plan §3. The browser POSTs the photo as
multipart to Express; Express uploads to Storage via service-role
**after** the quality + authenticity gates (actually before, then
cleans up on failure — see below). The frontend never touches Storage
directly for enrolment.
**Why:** Three reasons:

1. **Atomic failure semantics.** If quality/authenticity reject the
   photo, no Storage object should exist. The signed-URL-direct flow
   would leave orphan objects on every reject; an Express
   intermediate can `delete` the path on failure and surface a 422
   in one round-trip.
2. **Single trust boundary.** Authenticity (Reality Defender) needs
   the raw bytes server-side anyway. Sending bytes twice (browser
   → Storage, then Storage → Express → RD) doubles the egress for
   no reduction in bytes-touched-by-Express.
3. **Enrolment payloads are small.** ADR-2's "avoid re-streaming
   multi-megabyte images" concern targets Patrol Mode at 4 fps × 4
   cameras, not 3-5 enrolment photos at ≤10 MB each.

The Sniper Mode query upload (Tag 8) WILL use the signed-URL-direct
pattern as ADR-2 prescribes — there the orchestrator only needs the
storage_path, not the bytes.

**Trade-off:** Express becomes a 10 MB/req max-body ingress. The
existing `express.json({ limit: "1mb" })` is bypassed by multer's
own `limits.fileSize = POI_PHOTO_MAX_BYTES`. A 422 with `error:
image_too_large` fires before multer reads the body fully.

---

## D-012 — Patrol-mode 30s per-(poi, camera) debounce until ByteTrack lands

**Date:** 2026-04-25
**What the plan said:** Plan §3 Patrol Mode runs ByteTrack and only
embeds + recognises on **new** tracks (or tracks silent for > 2 s).
This naturally deduplicates: one person standing in front of the
camera produces one event when they enter and a second only if they
leave and re-enter the frame.
**What I did:** ByteTrack lands on Tag 7 — the Tag 6 recognise route
runs detect+embed+kNN on every frame. Without dedup, a person
standing still at 3 fps would generate one `events` row per frame,
flooding both the audit table and the Supabase Realtime channel.
The recognise INSERT is therefore guarded by a `WHERE NOT EXISTS`
predicate that suppresses an event if the same (poi_id, camera_id)
already produced one within the last 30 s. The match is still
returned to the frontend (`event_id: null` indicates the debounce
dropped it), so bbox overlays continue to render normally.
**Why:** Without it, the demo audit trail becomes useless within ten
seconds of a face entering frame, and the Realtime channel saturates.
The 30 s window is long enough to prove the dedup works during a
demo and short enough that a person re-entering frame after a brief
absence still produces a fresh event.
**Trade-off:** Tag 7 ByteTrack will swap this server-side time-window
for track-id-keyed dedup that is robust to the "same person walks
away for 3 s then back, same camera, same track-id" cases the time
window mishandles. The 30 s SQL guard is explicitly transitional;
the constant `EVENT_DEBOUNCE_MS = 30_000` lives in `recognize.ts`
with a comment pointing at Tag 7.

---

## D-013 — Patrol latency 949ms (vs §8 target 250ms): hosted-Supabase RTT dominates

**Date:** 2026-04-25
**What the plan said:** Plan §8 sets "Single-face Recognition E2E
< 250 ms".
**What I measured** (Tag 6 live smoke test against Supabase pooler
in ap-south-1, ~600 × 587 px image, 5 enrolled embeddings):

```
total: 949 ms   detect: 380 ms   knn: 379 ms   insert: 0 ms (no match)
```

**Why we miss the 250 ms target:**

- ML detect+embed (CPU, no batching, single 595 × 587 frame): 380 ms.
  Faster on a smaller frame, or with the ONNX Runtime GPU provider.
- pgvector kNN: 379 ms is dominated by **TLS round-trip latency to
  the Supabase pooler**, NOT the index lookup. The HNSW query
  against five vectors is sub-millisecond at the database; the RTT
  is ~370 ms.
- INSERT: 0 ms only because the test was a no-match case.

**Why this is acceptable now:** Plan §8's 250 ms target assumes the
production Docker stack (Postgres co-located with the server). The
dev environment (server local, Supabase hosted, ap-south-1) has
fundamentally different network characteristics. Tag 13 latency
benchmarks will run against a Docker-local Postgres and report both
numbers side-by-side in `EVALUATION.md`.

**Mitigations available before Tag 13:**

- Smaller browser-side frame (320 × 240 instead of 640 × 480) →
  ML latency roughly halves.
- Docker-local Postgres for the demo run, keep Supabase as the
  dev-friendly hosted state.
- Pipeline detect/embed and kNN in parallel for multi-face frames
  (currently sequential per face).

**Trade-off:** The defence story honestly reports two numbers
(hosted-Supabase dev vs Docker-local prod) instead of cherry-picking;
the architecture is unchanged either way.

---

## D-014 — Two-layer image size handling: client resize for UX, server resize for defence

**Date:** 2026-04-25 (post-Tag-6 mid-day improvement)
**What the plan said:** Plan §3 enrolment specifies a quality gate at
≥112 px face size; plan §9 caps the image-pixel limit at 4096²
(~16 M pixels). Neither pins a strategy for real phone-camera input
at 50–100 MP.
**What I did:** Added a two-layer pipeline so an operator can drag a
raw iPhone photo into the enrolment dropzone without touching it:

**Client (`client/src/lib/resizeImage.ts`)** — primary path:

- `createImageBitmap(file, { imageOrientation: "from-image" })`.
  Native EXIF-aware decode; iPhone portraits with `Orientation: 6`
  arrive upright instead of sideways.
- Downscale to ≤ 1920 px on the longest edge with high-quality canvas
  smoothing (`imageSmoothingQuality: "high"`).
- `canvas.toBlob("image/jpeg", 0.85)` — uniform JPEG output regardless
  of source format, drops payload from 10–25 MB raw HEIC/PNG to
  300–800 KB JPEG.
- `shouldSkipResize(file)` short-circuits at <600 KB — skipping the
  CPU work where the network savings are negligible.
- Wrapped in `try/catch` in `poi.ts uploadPhoto`. On any failure
  (corrupted file, HEIC on Chrome desktop without codec support, etc.)
  falls back to the original file plus a `console.warn`. The server
  then handles it.

**Server (`python/argus_ml/images.py`)** — defence-in-depth:

- `MAX_PIXELS = 100_000_000` — covers 50 MP iPhone Pro and 100 MP
  Samsung HM3 in raw form. The decompression-bomb defence still fires
  beyond that. PIL's own 89 M-pixel `MAX_IMAGE_PIXELS` warning is
  disabled (`Image.MAX_IMAGE_PIXELS = None`) because it would noise-up
  the log on every legitimate phone photo; our explicit
  pixel-count check after `pil.load()` is the canonical guard.
- After load, before `convert("RGB")`: `pil.thumbnail((2048, 2048),
Image.Resampling.LANCZOS)` if any edge exceeds 2048. In-place,
  preserves aspect ratio, runs on the heavy buffer once.
- `DecodedImage.width/height` carry the **post-resize** dimensions, so
  bbox coordinates the orchestrator returns to the frontend live in
  the same coordinate system the rendered image uses.
- `POI_PHOTO_MAX_BYTES` bumped 10 MB → 50 MB to match the UI hint and
  to cover client-resize-failure fall-throughs (a 30 MB original
  passes through Multer, the server-side resize handles it).

**Why two layers?** Either alone is brittle:

- Client-only: a future mobile app or a misbehaving browser could
  bypass resize and upload a 50 MB raw → server must defend itself.
- Server-only: every operator wastes 10–25 MB of upload bandwidth per
  photo over a hotel WiFi → enrolment becomes unusable on slow
  connections.
- Together: 99% of uploads are pre-resized to <1 MB; the 1% that
  bypass resize still complete because the server downscales them
  before face detection.

**Tests** (`python/tests/test_images.py`, 8 new tests, 8.10 s total):

- 24 MP (6000 × 4000) decodes without `image_too_large`.
- 50 MP iPhone-class image accepted; downscaled to 2048-edge.
- Aspect ratio preserved across the downscale (3:2 → 3:2).
- 800 × 600 input is **not** resized (downscale-only, no upscale).
- 108 M (above MAX_PIXELS) rejected with `image_too_large`.
- The `MAX_PIXELS = 100_000_000` and `RESIZE_TARGET_EDGE = 2048`
  constants are pinned by an explicit assertion so a future bump
  cannot silently regress.

**Trade-off:** The server resize work runs on every upload, even when
the client already shrunk to ≤ 1920. This is the only acceptable
trade — the alternative (skip server resize when input is small)
would couple server logic to a client contract that may not always
hold. The cost is one no-op `pil.thumbnail` call per upload, which
is microseconds for a 1920 px image.

---
