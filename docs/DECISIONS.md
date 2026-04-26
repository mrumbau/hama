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

## D-015 — Quality-gate thresholds are heuristic; Tag 13 substitutes empirical, production would use SDD-FIQA / CR-FIQA

**Date:** 2026-04-25 (post-Tag-6 mid-day improvement)
**What the plan said:** Plan §3 specifies "face size ≥ 112 px, blur
< threshold, pose-yaw < 45°" without pinning the blur threshold value.
**Background:** The Tag 4 default `QUALITY_MIN_BLUR_VAR=80` was
chosen by inspection on a handful of test images that were mostly
DSLR-class. Modern smartphone front-cameras apply aggressive sensor
smoothing — iPhone selfies typically score Laplacian-variance 60-75
on the **full** bbox crop even when the face is sharp enough that
ArcFace embeds it robustly (cosine > 0.95 to a paired reference).
The 80 threshold rejected legitimate operator-collected selfies,
making enrolment painful for the demo.

**What I changed:**

1. **Threshold lowered from 80 to 40** in `argus_ml/config.py`. 40
   is below the smartphone-sensor regime (60-75) and well above the
   noise floor of synthetic / clearly-blurry images (single-digit
   variance). It is empirically chosen on a small sample — Tag 13
   substitutes with a histogram-derived threshold (see
   EVALUATION.md "Quality-gate calibration").

2. **`_crop_for_blur` switched from full bbox to central 60%.** The
   outer 20% margin on each edge contained hair / forehead / wall
   transitions whose high-contrast edges inflated the variance
   independently of in-face sharpness. A face against a textured
   wall scored the same as the same face against a flat backdrop;
   the new crop measures only the inner-face region (eyebrows-to-
   chin × inter-cheek), where the sharpness signal lives. New
   constant `_BLUR_CROP_INSET = 0.20`. Three pure-logic tests in
   `tests/test_quality.py` lock the math (60×60 region from a
   100×100 bbox) and the signal-isolation property (uniform centre
   - noisy border → high full-bbox variance, near-zero central
     variance).

3. **Operator-facing reason copy.** Pre-D-015, a rejected photo
   showed `REASONS: TOO_BLURRY` and the operator had no path
   forward. New `client/src/lib/qualityReasons.ts` maps each code
   to a (title, hint) pair. The blur hint is the actionable bit:
   _"Smartphone front-cams apply heavy smoothing that the blur gate
   reads as out-of-focus. Try good lighting, or use the rear camera
   or a DSLR."_ The machine-readable code stays visible underneath
   for operator-to-developer error reports.

**Production alternative (defended in EVALUATION.md):**
A heuristic Laplacian variance is the simplest face-quality signal
that runs without a model. Production-grade systems use predicted
**face image quality** networks:

- **SDD-FIQA** (Stochastic Embedding Robustness, FG 2021) — predicts
  expected ArcFace robustness on a cropped face.
- **CR-FIQA** (Certainty-Ratio FIQA, CVPR 2023) — predicts the
  certainty ratio of a face's similarity to its own class against
  impostor classes; lower FRR than SDD-FIQA at fixed FAR.

Either replaces `_laplacian_blur_var` + the `QUALITY_MIN_BLUR_VAR`
threshold with a single predicted score (~5-10 MB ONNX, runs in the
same Python worker as buffalo*l). The current heuristic is
explicitly transitional. The defence answer to "why not FIQA?" is:
*"FIQA is the right answer for production; for a 14-day uni project
the central-crop Laplacian plus the empirical threshold gives the
same operator-experience improvement at zero added model cost."\_

**Trade-off:** The heuristic is fundamentally less robust than a
model-based score across hard cases (extreme low-light, occluded
glasses, motion blur with high in-face frequency content). A
production deploy that hits these regimes regularly should swap to
FIQA. The Argus codebase isolates the gate in `quality.py` so
changing the score source is a one-file change.

**Tests:** 12/12 quality unit tests pass with the new threshold and
crop. The `test_too_blurry` and `test_multiple_reasons_combined`
tests still use `s.QUALITY_MIN_BLUR_VAR - 1` and so adapt to the
new default automatically. Three new central-crop tests verify
the 60×60-from-100×100 math and the signal-isolation property
(synthetic uniform-centre / noisy-border image: full-crop variance

> 1000, central-crop variance < 1).

---

## D-015 v2 — Blur measured on the eye region, not the bbox (Portrait Mode robustness)

**Date:** 2026-04-25 (same-day amendment to D-015 v1)
**What I missed in v1:** D-015 v1 moved the blur measurement from the
full bbox to the central 60% × 60%. That handled the wall-edge / hair
contamination case correctly, but it did NOT handle the case the user
reported afterwards: **iPhone Portrait Mode and Cinematic Mode** apply
graduated depth-of-field that softens pixels along the bbox border —
including parts of the central-60% region (collar, hair fringe, shoulder
fade-out). A face that is genuinely sharp scored
`blur_var ≈ 30-50` because the depth-of-field surroundings dragged the
mean down. Threshold 40 (D-015 v1) still rejected legitimate
in-focus selfies.

**What I changed (v2):**

1. **New helper `_eye_region_blur_var(image_bgr, kps)`** in
   `argus_ml/face.py`. Takes the 5-point keypoints, derives the
   inter-eye distance (iod), and crops a rectangle of size
   1.6 × iod (horizontal) × 1.0 × iod (vertical), centred on the
   midpoint between the two eye landmarks. The crop covers eyes +
   nose bridge + upper cheeks — the spatial region that:
   - **Always falls inside the in-focus foreground** of any modern
     phone-camera autofocus or Portrait/Cinematic Mode, because the
     focus point lands on the eyes by design.
   - **Carries the highest _useful_ high-frequency detail in a
     face**: eyelashes, iris texture, eyebrow hair. These features
     produce a Laplacian signal that survives sensor smoothing,
     unlike the smooth-skin cheek pixels the central-60% crop also
     included.

2. **`_to_detected` wires the new path.** When `kps` has ≥ 2 points
   (RetinaFace from buffalo_l always emits 5), the eye-region path
   runs. The legacy `_crop_for_blur` (central 60%) is kept only as
   a fallback for hypothetical detectors that emit no keypoints.
   Two anti-regression tests pin both paths.

3. **`QUALITY_MIN_BLUR_VAR` recalibrated 40 → 150.** The eye region
   contains denser high-frequency content per pixel than the
   central-60% bbox crop, so the same "sharp face" measures higher.
   150 is heuristic — Tag 13 still substitutes with the empirical
   30-selfie histogram (EVALUATION.md backlog "Quality-gate
   calibration").

**The single-test motivation** in
`tests/test_quality.py::test_eye_region_robust_to_portrait_mode_bokeh`:
build an image where a sharp high-frequency rectangle covers the
eye-region rect and the rest is flat grey. The full-bbox crop scores
near zero variance (drowned in flat grey); the eye-region crop scores

> 1000. The inverse test
>       `test_eye_region_correctly_flags_motion_blur_on_eyes` confirms the
>       gate still rejects truly blurry eyes — the metric did not become
>       permissive, just better-targeted.

**Operator-facing copy update.** The pre-v2 hint
("Smartphone front-cams apply heavy smoothing that the blur gate
reads as out-of-focus") was a workaround for the v1 false-positive
case and is now obsolete. The v2 hint reflects the new metric:
_"Argus measures sharpness on the eye region — the depth plane that
should always be in focus. Common causes: motion at capture, focus
point on the background instead of the face, or thick glasses
reflecting the light source."_

**Tests:** 39/39 pytest green. Five new pure-logic tests in
`test_quality.py` cover: degenerate kps (returns 0), Portrait Mode
simulation (sharp eyes / flat surroundings → eye-region passes,
bbox would fail), motion-blur-on-eyes simulation (blurred eyes /
sharp surroundings → eye-region correctly fails), bounds-clipping
when eyes near image edge, and exact rectangle dimensions
(1.6 × iod × 1.0 × iod, centred on eye midpoint).

**Why not FIQA still:** Same answer as v1 — production should swap
to SDD-FIQA / CR-FIQA. The eye-region heuristic is a one-day
improvement that gets us past the operator-experience problem
without adding model weight. The gate stays a single function in
`quality.py`, so the FIQA swap remains a one-file change.

---

## D-016 — Quality-gate thresholds finalised on real smartphone photography (algorithm kept, threshold relaxed, det-score floor added)

**Date:** 2026-04-26
**Diagnosis:** Across all three earlier iterations (Tag 4: full bbox @ 80,
D-015 v1: central-60% @ 40, D-015 v2: eye region @ 150) the
**algorithm** improvement was real, but the **threshold** I picked each
time was set in isolation against synthetic / DSLR-style references
and did not match the variance distribution of modern iPhone /
Samsung computational-photography output. On the user's actual test
selfies the eye-region helper measures Laplacian variance in the
**~80–200 range** for visually sharp faces — well above the v1 = 40
threshold but well below the v2 = 150 threshold. v2 was rejecting
photos that any human reviewer would call sharp.

The earlier rejections also weren't always blur-related at all. Some
were RetinaFace mis-detections (hand, occluded face, low light)
returning a low-confidence bbox that the quality gate then judged as
if it were a real face — wasting downstream embedding capacity on
something that wasn't a face to begin with.

**What I changed (final iteration):**

1. **`QUALITY_MIN_BLUR_VAR` recalibrated 150 → 30.** The eye-region
   _algorithm_ from D-015 v2 is geometrically correct (it crops the
   in-focus depth plane regardless of Portrait / Cinematic Mode bokeh)
   and stays. Only the threshold drops, to fit the empirically observed
   eye-region variance distribution of real iPhone selfies. 30 is still
   strict enough to catch deliberate motion blur — proved by the new
   `test_gaussian_blurred_eye_region_drives_gate_to_too_blurry` test,
   which Gaussian-blurs the eye-region rect with σ=15 and confirms the
   gate rejects with `too_blurry`.

2. **`QUALITY_MAX_POSE_YAW_DEG` 45 → 55.** Slightly more pose
   tolerance for natural enrolment angles, without admitting near-
   profile shots that hurt embedding quality. ArcFace 512-D is robust
   to ±55° in our tests; we only enrol 3–5 photos per POI so a single
   permissive pose still leaves the embedding bank well-conditioned.

3. **New `DETECTOR_QUALITY_MIN = 0.75`** in `argus_ml/config.py` and a
   matching `low_confidence_detection` reason in `quality.py`. This
   is a separate axis from `DETECTOR_MIN_SCORE = 0.5` (the
   admission floor inside `detect_faces` — kept permissive so Patrol
   Mode still sees marginal webcam frames). The new floor only
   applies inside the enrolment quality gate: any face detected at
   `det_score ∈ [0.5, 0.75)` is admitted by the detector (visible to
   Patrol) but rejected for enrolment. Closes the gap that all three
   earlier blur iterations left open: a hand or partial occlusion
   could still pass if its Laplacian variance happened to be high.

4. **Operator copy.** New `qualityReasons.ts` entry for
   `low_confidence_detection`: _"Detector unsure about face. Causes:
   partial occlusion (mask, hand, hair across the face), extreme
   angle, very low light, or heavy compression artifacts. Try a
   different photo with the face fully visible and well-lit."_ The
   `pose_extreme` hint is updated for the new ±55° bound.

**Defence framing.** This is the final calibration iteration before
Tag 13 substitutes the heuristic with an empirical CDF over a 30-
selfie corpus (EVALUATION.md backlog). The defensible story for the
oral defence: _"Quality gate is layered — eye-region sharpness
(geometric + Laplacian, robust to Portrait Mode), pose tolerance
(yaw from 5-point landmarks), face-size floor, and detector
confidence (rejects mis-detections before they pollute the embedding
bank). All four thresholds are heuristics calibrated against real
smartphone output; production-grade replacement is SDD-FIQA / CR-FIQA
as a learned face-image-quality score."_

**Tests:** the synthetic GaussianBlur end-to-end test
(`test_gaussian_blurred_eye_region_drives_gate_to_too_blurry`) plus
two new det-score tests (`test_low_confidence_detection`,
`test_high_confidence_detection_passes_floor`) plus the extended
`test_multiple_reasons_combined` that exercises all four reasons
simultaneously. All earlier eye-region tests stay green — the
algorithm did not change.

**Why not just keep raising / lowering the threshold:** I now have
the full ladder in front of me — Tag 4 → D-015 v1 → D-015 v2 → D-016
— and any further single-threshold change will trade FRR for FAR
the same way. The next material improvement is replacing the
heuristic with a learned signal, not nudging the constant. That is
exactly what the Tag 13 EVALUATION.md backlog and the production
FIQA recommendation are scoped against.

---

## D-017 — Laplacian-blur axis removed from the quality gate (final)

**Date:** 2026-04-26 (same-day amendment to D-016)
**Ground-truth datapoint that decided it:** A clean, frontal,
well-lit iPhone enrolment selfie — visually indistinguishable from
any defensible reference photo — measures `blur_var = 35` on the
eye region. The post-D-016 threshold sits at 30. The same selfie
measures `det_score = 0.81`, comfortably above the 0.75 quality
floor introduced in D-016.

**The full iteration ladder:**

| Iteration | Crop region                    | `QUALITY_MIN_BLUR_VAR` | What it tried to fix                                                                  |
| --------- | ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------- |
| Tag 4     | Full bbox                      | 80                     | Initial DSLR-calibrated heuristic                                                     |
| D-015 v1  | Central 60% × 60%              | 40                     | Hair / wall edges in the bbox margin inflated variance independently of face sharpness |
| D-015 v2  | Eye region (1.6×iod × 1.0×iod) | 150                    | Portrait-Mode bokeh contaminated even the central-60% crop                            |
| D-016     | Eye region (unchanged)         | 30                     | Real iPhone computational-photography selfies measure ~80–200; 150 was over-rejecting |
| **D-017** | **disabled**                   | **0.0**                | **The discriminative range is too narrow to be a useful classifier on this input distribution** |

**Why D-016's threshold was the wrong tool, not the wrong number:**
Each iteration narrowed the algorithm against the previous failure
mode and lowered the threshold to compensate. By D-016 the threshold
sat at 30, and the ground-truth observation made the underlying
problem visible: the **range** of `blur_var` between "sharp,
visually unimpeachable" (35) and "slightly soft, would not enrol"
(20-25 in the same operator's hand-labelled set) is only ~5–15
points. That is not a robust classification boundary — it is a
boundary that would flip on noise, on cropping resolution, on JPEG
quantisation. The Laplacian variance of an eye-region crop carries
real information about sharpness, but on the modern computational-
photography input distribution the **signal-to-noise ratio of the
threshold decision** is too low for a hard reject.

By contrast `det_score` separates the same operator's labelled set
with a much wider margin: 0.81+ for clean enrolment selfies, sub-0.6
for hand / occluded / extreme-low-light frames the gate should
actually reject. The D-016 floor at 0.75 already covers every
failure mode the blur axis was reaching for — only with a wider
margin and without the false-positive risk on real selfies.

**What I changed:**

1. **`QUALITY_MIN_BLUR_VAR` set to 0.0** in `argus_ml/config.py`
   with `ge=0` (was `gt=0`). 0.0 is a sentinel: the gate check
   `f.blur_var < s.QUALITY_MIN_BLUR_VAR` can now never fire because
   `blur_var ≥ 0` by construction. Set the env var to a positive
   value to re-enable the gate for legacy DSLR-class inputs where
   the discriminative range is wider.

2. **`quality.py` reasons-list path no longer appends `too_blurry`.**
   The `_eye_region_blur_var` helper still runs inside `_to_detected`
   in `face.py` and the resulting variance still lands in
   `metrics["blur_var"]` for every enrolment attempt. That metric
   feeds the Tag 13 FIQA benchmark — we keep the data flowing so the
   replacement evaluation has empirical material.

3. **`qualityReasons.ts` drops the `too_blurry` entry.** The server
   no longer emits this code; the existing `describeReason` fallback
   surfaces any legacy code that might appear in old fusion reports.

4. **Tests.** `test_too_blurry` and
   `test_gaussian_blurred_eye_region_drives_gate_to_too_blurry` are
   `@pytest.mark.skip(reason="disabled per D-017, kept for Tag 13
   FIQA benchmark")` — they will be re-enabled in the FIQA
   evaluation against a learned face-image-quality score.
   `test_multiple_reasons_combined` is updated to the post-D-017
   reason set (face_too_small + pose_extreme +
   low_confidence_detection). A new
   `test_blur_var_does_not_drive_gate_post_d017` locks in the
   contract that a low `blur_var` no longer fails the gate but still
   surfaces in metrics.

**The remaining gate is layered:** face count, face size,
pose-yaw, det_score. All four have wider discriminative margins
than the Laplacian variance had on the same input distribution.

**Defence framing.** _"The quality gate iterated through three
algorithmic variants of the Laplacian blur measurement (full bbox,
central-60% crop, eye-region crop) and three threshold values before
I had ground-truth measurements showing the discriminative range was
~5–15 variance points between accepted and rejected examples. That
is too narrow to be a useful classifier on the modern computational-
photography input distribution; the same failure modes are caught by
`det_score` with a much wider margin. The blur metric is retained as
a metric in the report — it feeds the Tag 13 evaluation against
CR-FIQA, where the question is whether a learned face-image-quality
network has a wider discriminative margin than `det_score` alone on
the same inputs."_

**What gets re-enabled and when:** Tag 13 EVALUATION.md, "Quality-
gate calibration", evaluates CR-FIQA on the 30-selfie corpus,
with ROC against a `det_score`-only baseline. If CR-FIQA shows a
materially better FRR/FAR trade-off than `det_score` alone, the
gate gets that extra axis back — but as a learned score, not as a
hand-tuned Laplacian threshold.

---

## D-018 — Tag 7: Track-then-Recognize landed; D-012 superseded

**Date:** 2026-04-26
**Why this is a D-entry, not just an ADR-3 cross-reference:** the
implementation pulled in three small decisions that are too tactical
for the architecture doc but matter for future readers.

1. **`supervision==0.22.0` pinned, not `>=`.** The transitive
   dependency chain on supervision ≥ 0.25 pulls `opencv-python`
   instead of `opencv-python-headless`, which in turn upgrades numpy
   to 2.x. Insightface 0.7.3's compiled ABI links against numpy 1.x;
   numpy 2 breaks `face_align` at import. Pinning to 0.22.0 is a
   compatibility decision for as long as we run insightface 0.7.x.
   When insightface ships a numpy-2-clean release we can unpin.

2. **`tracker_state_key = ${camera_id}:${session_uuid}`** on the
   client, generated once per Patrol page mount with `crypto.
   randomUUID()`. Server-side default falls back to `${camera_id}`
   when the client doesn't supply one — keeps `curl` smoke-tests
   simple. The session suffix is the cleanest fix for "same camera_id
   across reloads picks up stale ByteTrack state from Redis"; without
   it the first event after a page reload would dedup against a
   `(poi, camera, track)` triple from the previous session.

3. **`events.track_id` is nullable, with a partial dedup index.**
   Tag 6 events and any future non-Patrol kinds (sniper_match) keep
   `track_id IS NULL`; the partial btree index
   `events_track_dedup_idx ON (camera_id, track_id, poi_id) WHERE
   track_id IS NOT NULL` is the support for the Tag 7 dedup query
   without bloating the index for every event row.

**Constants tuned** (in `argus_ml/config.py`):

| Constant                  | Value | Why                                                                                                                |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| `BYTETRACK_FRAME_RATE`    | 10    | Patrol runs at ~5–10 fps. supervision computes `max_time_lost = int(fps/30 * 30)` so frame_rate=10 → 10-frame buffer (~1 s of occlusion forgiven). |
| `TRACKER_STATE_TTL_S`     | 60    | Camera silence longer than this resets the tracker — desired behaviour for a demo where the operator may pause for several minutes. |
| `TRACK_EMBED_TTL_S`       | 30    | Hard upper bound on a cached ArcFace vector's lifetime.                                                            |
| `TRACK_EMBED_MAX_AGE_S`   | 2.0   | Soft freshness — anything older is treated as a cache miss to keep the embedding from lagging appearance changes.  |

**What was NOT done in Tag 7** (intentional, scoped for later):

- **No match-cache.** Only embeddings are cached. The kNN call still
  runs every frame because pgvector is the only authoritative source
  for "is this a registered POI?" — caching the match would create a
  correctness hazard if the operator enrols a new POI mid-session.
  Tag 13 may revisit if the empirical speedup numbers are below the
  ADR-3 5× target.
- **No client-side tracker.** The browser uses the server's
  `track_id` to React-key the bbox, but does not run its own
  tracker. Keeps the implementation single-source-of-truth.

**Dependency added on local Redis.** `make demo` already starts
`docker compose up -d redis`. For the dev workflow on macOS we
recommend `brew services start redis` instead — the docker-compose
container is for the production-like demo bring-up, not the inner
loop. The ML service treats Redis-unreachable as a hard failure
(no silent fallback to no-tracking) because the response contract
includes `track_id` per face.

**Tests added** (Python: `test_tracking.py` 11 cases +
`test_routes.py` 2 cases; Server: `ml-client.test.ts` 1 case). All
green: 54 pytest passed (2 skipped per D-017), 33 vitest passed
including the live HNSW-vs-brute-force corpus check.

**Plan-target proof.** §13 Tag 7 gate is "ByteTrack im ML-Service +
Track-then-Recognize ersetzt 30s-Time-Window-Debounce". Replaced. The
Tag 13 EVALUATION.md backlog "tracking speedup + visual stability"
runs the empirical 5–8× claim against a recorded session.

---

## D-019 — Tag 8a: Sniper backbone landed (Layer 1 + Cost Guard + Circuit Breaker)

**Date:** 2026-04-26
**Why a D-entry alongside ADR-6:** ADR-6 records the architecture
(parallel layer fan-out, cost guard, circuit breakers). D-019 records
the **scoping decision**: Tag 8 splits into two halves so each is
greppable, testable, and reviewable on its own.

### What landed in 8a

1. **Database**
   - Migration 0008 creates `daily_cost_ledger` (PK
     `(operator_id, day_utc, service)`, FK to auth.users with
     ON DELETE CASCADE, RLS so operators read only their own row).
   - Drizzle schema mirror in `shared/schema.ts`.
2. **Libraries**
   - `lib/circuit-breaker.ts` — pure-logic class with closed / open /
     half-open states, named-instance registry, injectable clock for
     testing. 8 pure-logic tests in `circuit-breaker.test.ts` cover
     every transition including half-open-failure-bounces-to-open.
   - `lib/cost-guard.ts` — `chargeOrReject(operatorId, service, eur)`
     in a single CTE round-trip; atomic against concurrent calls
     (post-increment total computed inside the same statement).
     `dailySummary(operatorId)` for the Tag 9 budget headroom widget.
3. **Orchestrator**
   - `orchestrator/sniper.ts::runSniperReport` uploads the query to
     the `sniper-queries` bucket, inserts the report + 4 layer rows
     atomically, runs Layer 1 synchronously, calls `finalizeReport`
     which keeps the report in `processing` because Layers 2-4 are
     still `pending`. Tag 8b's parallel-fanout will be the
     `finalizeReport` caller that promotes status to `complete`.
   - `orchestrator/layers/identity.ts::runIdentityLayer` is the
     Tag 6 kNN pipeline widened to K=10 + grouped output (every POI
     in the top-10 surfaced with votes + median similarity + the
     POI's own configured threshold).
4. **HTTP**
   - `routes/sniper.ts` wires `POST /api/sniper/run` (multipart
     upload, 10 MB cap matching the bucket) and `GET /api/sniper/:id`
     (polling fallback for the Tag 9 UI when Realtime drops).
5. **Layer payload schemas** in `shared/fusion.ts`:
   `identityPayloadSchema`, plus pre-declared placeholders for
   `webPresence` / `geographic` / `authenticity` so Tag 9 can render
   against fixed shapes ahead of Tag 8b.

### Tactical decisions worth recording

1. **Cost-ledger column type.** `numeric(8, 4)` not `real` — euros
   need exact decimal arithmetic for an audit trail; floats would
   eventually drift on accumulation. The 8-digit precision covers
   four digits before the decimal (≤ €9999) and four after (sub-cent
   resolution per call), comfortably above what any single operator
   will spend per day.
2. **Day boundary in UTC.** Picked because all three external
   services document their billing cycles in UTC, and a single
   timezone keeps the dashboard query (`WHERE day_utc = (now() AT
   TIME ZONE 'utc')::date`) trivial.
3. **Service column is text-with-CHECK rather than enum.** Adding a
   fourth provider is a one-line ALTER TABLE updating the CHECK
   constraint — no enum dance.
4. **Tag 8a finalizeReport stays in 'processing'**. The status-
   promotion logic only runs `complete` if all 4 layers reach a
   terminal state. Tag 8a only decides Layer 1 → so reports stay
   processing until 8b lands. The DB stays self-consistent in the
   meantime.
5. **Sniper test fixture:** `server/tests/fixtures/t1.jpg` is a
   committed copy of InsightFace's bundled t1.jpg group photo
   (210 KB). Generated via `python -c "..."` in the venv; same
   image the Python tests use. Keeping it as a binary fixture rather
   than re-generating it per test run avoids depending on the venv
   being installed when only TS tests run.
6. **Vitest alias surface.** Added `@argus/shared/fusion` to
   `server/vitest.config.ts` aliases. Vite's prefix-matching would
   otherwise route the import to `shared/index.ts` and the dynamic
   resolution failed at runtime.

### What's NOT done in 8a (deferred to 8b, intentional)

- Layers 2-4 stay 'pending' forever until 8b. The orchestrator
  doesn't even *try* to run them — no stub that fails immediately
  with `not_implemented_yet`, because that would generate confusing
  "failed" rows in the audit log. Pending is the honest state.
- The cost guard isn't wired to anything yet. The library is in
  place + tested, but no orchestrator path calls it because Layer 1
  has no upstream cost.
- The circuit breaker is registered but never named-resolved by
  any caller. Same reason.
- No Reality Defender real-mode promotion — the existing stub
  remains. 8b lands the presigned-upload + polling client per
  the sketch in `external/reality-defender.ts:104-135`.

### Tests

- 8 circuit-breaker, 3 cost-guard (DB-bound, skips without
  DATABASE_URL), 1 sniper end-to-end (DB + ML-bound).
- Total: 45 vitest passed (was 33 pre-Tag-8a, plus 12 new from this
  scope).

---
