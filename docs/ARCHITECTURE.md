# Argus — Architecture

This document is written ADR-style: each decision is one section, with status,
context, decision, and consequences. New ADRs are appended in chronological
order. Superseded ADRs stay in the file with a "Superseded by …" note.

For a per-day live changelog of smaller decisions, see [DECISIONS.md](./DECISIONS.md).

---

## ADR-0 — Tabula rasa: discard pre-existing codebase

**Status:** accepted (2026-04-25)

### Context

The repository started life as a Replit fork containing three parallel,
mutually-incompatible Python face-recognition servers, two byte-identical
copies of the Express entry point, ~50 unused npm dependencies pulled in by
the Replit template (shadcn, Radix, TanStack, Drizzle, Passport, face-api.js,
TensorFlow.js, Sharp, Recharts, …), a `server/storage.ts` whose import target
`@shared/schema` did not exist, an empty SQLite/JSON criminals datastore that
contradicted the Postgres URL in `.env`, a `server/routes/searchImages.ts`
that nothing called, and live secrets (Neon Postgres password, SerpAPI key,
ngrok tunnel URL) committed in `.env`.

The single feature that actually worked end-to-end was a SerpAPI-based
reverse image search wired to one of the three Python servers; it represented
maybe 5 % of the surface area of the repo.

### Decision

Delete everything below the top-level `client/`, `server/`, `python/`
directory names (which are kept so the examiner recognises the repo). Within
those directories, every file is removed and rewritten. A `git tag
pre-argus-snapshot` preserves the previous state for comparison during the
oral defence.

### Consequences

- Defence story stays simple: one ML server, one entry point, one source of
  truth per concern.
- `package.json` shrinks from 90+ deps to ~25 actually-imported ones.
  CI gate (`pnpm depcheck`) blocks regression.
- Lost work: none worth keeping. The reverse-image-search pipeline is
  re-implemented as Layer 2 of the Sniper Mode fusion engine, in cleaner
  form, against the same SerpAPI engines (Google Lens, Google Reverse,
  Bing Reverse).
- Cost of incremental cleanup would have exceeded a rewrite: every file
  touched would need security review (live secrets), schema reconciliation
  (`@shared/schema` ghost imports), and dependency surgery. A 2-week
  rewrite is cheaper than a 4-week archaeology pass.

---

## ADR-1 — OSINT fusion over single-source recognition

**Status:** accepted (2026-04-25)

### Context

A face-recognition system that does only _internal_ DB matching is in 2026
commodity tooling: pgvector + ArcFace + 200 lines of code gives a working
demo. The university project asks for engineering depth that justifies a
30-minute oral defence.

### Decision

Argus is an **OSINT fusion engine**: one face photo in, four independent
identity layers out, correlated in a single report.

| Layer | Source                                         | What it answers                                       |
| ----: | ---------------------------------------------- | ----------------------------------------------------- |
|     1 | pgvector kNN against own POI DB                | "Have we registered this person?"                     |
|     2 | SerpAPI (Google Lens + Reverse + Bing Reverse) | "Where else does this face appear on the public web?" |
|     3 | Picarta API on the input photo                 | "Where was this photo taken?"                         |
|     4 | Reality Defender API on top-N matches          | "Is the input or any match a deepfake?"               |

Two operational modes share the same backbone:

- **Sniper Mode** (investigator) — all four layers fire in parallel against
  one uploaded photo, results stream into a five-column dashboard as each
  layer finishes.
- **Patrol Mode** (operator) — only Layer 1 runs, on a webcam stream, with
  multi-face tracking and live bbox overlay.

### Consequences

- The engineering interest of the project is **layer parallelisation, latency
  choreography, partial-failure handling, and unified operator UX over
  heterogeneous sources** — not face recognition itself.
- Each layer is independently rebuildable, cacheable, and circuit-breakable.
- The defence thesis is one sentence: _"Recognition alone is commodity; the
  value is in the correlation."_
- Layer 5 (vision-LLM scene context) was specified in an earlier draft and
  has been dropped — see [DECISIONS.md D-002](./DECISIONS.md).
- FaceCheck.ID, originally part of Layer 2, was dropped — see
  [DECISIONS.md D-003](./DECISIONS.md). Layer 2 remains useful via SerpAPI's
  three engines.

---

## ADR-2 — BaaS for auth/storage/realtime, owned stack for ML and fusion

**Status:** accepted (2026-04-25)

### Context

The system needs: user authentication, image upload, realtime push of new
events to the operator UI, row-level access control, and a Postgres database
with a vector column.

Two extreme choices: build everything (auth-from-scratch + WebSocket hub +
file storage abstraction + RLS reimplementation) or hand everything to a
BaaS. The first burns two weeks on commodity plumbing; the second buys a
working product but tells no engineering story.

### Decision

**Boring stuff to Supabase (hosted free tier).** Auth, Storage, Realtime,
and the Postgres+pgvector instance run on Supabase. The frontend talks
directly to Supabase for those concerns using the anonymous key, gated by
RLS policies.

**Engineering-interesting stuff stays self-hosted.** The Express
orchestrator, the FastAPI ML service, the Redis tracker state, the fusion
pipeline, and all external-API integrations run as our own services.
External API keys (SerpAPI, Picarta, Reality Defender) live exclusively in
`server/.env` — the frontend never sees them.

This means the frontend has **two channels**:

1. `supabase-js` (anon key) — auth, file uploads to private buckets,
   realtime subscriptions on `events` and `fusion_layers`, simple reads
   gated by RLS.
2. `fetch /api/*` (Supabase JWT in `Authorization` header) — anything that
   needs ML inference, external APIs, or business logic.

### Consequences

- Three Supabase keys must be kept rigorously separate:
  - **anon** (frontend, RLS-protected)
  - **service-role** (server, bypasses RLS — never reaches the browser)
  - **JWT secret** (server, used to verify incoming access tokens)
    Mixing them is the most likely security regression. Tests explicitly
    assert the anon key cannot write to `face_embeddings` or `events`.
- Realtime push is "free": the same `postgres_changes` channel that
  delivers Patrol Mode event alerts also delivers Sniper Mode layer
  results. No second streaming mechanism (no SSE endpoint, no WebSocket
  hub) is needed. See ADR-7 (to be written when implemented).
- The custom login form is built against `supabase.auth` directly, not
  against `@supabase/auth-ui-react`. Supabase Auth UI styles are
  incompatible with the brutalist/minimalist design system; the auth
  pre-built component is a one-line save that costs the entire visual
  identity of `/login`.
- File uploads go **directly from browser to Supabase Storage** (signed
  upload URL pattern) and never traverse Express. This avoids re-streaming
  multi-megabyte images through a middle service whose only added value
  would be re-uploading them.

---

## ADR-5 — RLS as the second line of defence

**Status:** accepted (2026-04-25)

### Context

Plan §4 puts the frontend on two channels: `supabase-js` with the anon key
for "boring" reads/writes, and `fetch /api/*` with a Supabase JWT for
anything that needs ML inference, external APIs, or business logic. The
Express orchestrator authenticates with the **service-role key**, which
bypasses RLS, so the orchestrator can write any row on behalf of any
operator.

This means the anon key reaches the browser. It is in the bundled JS, in
DevTools, in the Network tab. We must assume an attacker has it.

### Decision

**Every public-schema table runs with `ENABLE ROW LEVEL SECURITY` and
`FORCE ROW LEVEL SECURITY`.** The default behaviour is therefore deny.
Policies are written one per concern, scoped to the `authenticated` role
explicitly:

| Table             | SELECT                                  | INSERT / UPDATE / DELETE                                                                |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `profiles`        | authenticated (read all)                | INSERT via on-signup trigger only · UPDATE own only, cannot self-promote · DELETE never |
| `poi`             | authenticated (active rows + admin all) | service-role only                                                                       |
| `face_embeddings` | authenticated (read all)                | service-role only                                                                       |
| `events`          | authenticated (read all)                | UPDATE only `operator_id = auth.uid()` or admin · INSERT/DELETE service-role            |
| `fusion_reports`  | authenticated (own + admin all)         | service-role only                                                                       |
| `fusion_layers`   | authenticated, gated by parent report   | service-role only                                                                       |
| `storage.objects` | authenticated (the three Argus buckets) | service-role only                                                                       |

A SECURITY-DEFINER `is_admin()` function inside the policies reads the
caller's `profiles.role`. Profiles are auto-created by an `on_auth_user_created`
trigger when Supabase Auth signs a new user up, defaulting to
`role = 'operator'` — never `admin`.

### Consequences

- A compromised anon key cannot insert face_embeddings, write events, or
  read another operator's fusion reports. The blast radius is reduced to
  what authenticated reads expose, which is intentional (the operator UI
  reads the same shared data via supabase-js for realtime).
- A compromised authenticated session (an operator stolen via XSS) can
  only resolve their own pending events, not someone else's, and cannot
  read someone else's sniper reports.
- The Express service-role connection bypasses RLS by design. RLS is not
  meant to defend against the orchestrator — the orchestrator is the
  privileged actor. RLS defends the _path through the browser_.
- This is testable. `tests/rls.test.ts` runs against the live Supabase
  project on every `pnpm test`, attempts INSERTs with the anon-key client,
  and asserts they fail. If a future migration adds a table without a
  policy, the failing test catches it.

### Verification (Tag 3 gate, completed 2026-04-25)

- 8 RLS policies installed across 6 tables + 1 storage policy.
- HNSW index `face_embeddings_hnsw_cosine` present.
- 4 RLS tests passing against live Supabase: anon cannot insert
  face_embeddings, events, poi; anon SELECT poi returns no rows.
- 5 JWT middleware unit tests passing: valid token accepted, wrong-secret
  rejected, expired rejected, malformed payload rejected, missing bearer
  rejected.

---

## ADR-4 — Multiple embeddings per POI, median-of-top-K voting at recognition

**Status:** accepted (2026-04-25). Recognition consumer lives in Tag 6.

### Context

A single ArcFace embedding per POI works against the same head pose,
expression, and lighting — and degrades sharply outside that envelope.
Operators enrolling a POI for recognition across security cameras need
robustness to ±15° head turn, glasses on/off, evening vs daytime
lighting, and the occasional partial occlusion.

The two clean strategies are:

1. **Mean-pooling at enrol** — average the N embeddings into one
   vector, store that. pgvector kNN is then 1:1 and indexes the centroid.
2. **All vectors stored, median-of-top-K at query** — store every
   embedding, query with k=N candidates per probe, vote by majority
   poi_id, score = median of cosine distances within the winning POI.

### Decision

We store **every embedding individually** in `face_embeddings`, with
the FK back to `poi`. At recognition time (Tag 6) the kNN query is
`SELECT poi_id, embedding <=> $probe AS dist FROM face_embeddings
ORDER BY dist LIMIT 5`. The result set is grouped by poi_id; the
majority poi_id wins; the **median cosine distance** within the
winning group becomes the recognition score.

Required enrolment: ≥ 3 embeddings per POI (frontend enforces; backend
allows fewer for partial enrolment but recognition treats <3 as
"unenrolled"). Maximum 5 to keep the kNN result set bounded.

### Why not mean-pooling?

- Mean-pooling collapses pose variation that the operator deliberately
  enrolled. If an operator gives front / left / right, the mean is
  somewhere between front and a profile direction — a face seen from
  any one angle then matches the centroid less well than it would
  match the most similar enrolled photo.
- Median-of-top-K is **resistant to a single bad photo**: an embedding
  with a quality-gate-near-miss (slightly blurry, marginal lighting)
  drops out of the median and does not move the score. Mean-pooling
  propagates it.
- Storage cost is trivial: 5 × 512 × 4 bytes = 10 KB per POI. The
  HNSW index handles thousands of total embeddings without issue.
- Query cost difference is negligible: HNSW with k=5 instead of k=1
  is ~5% slower in pgvector benchmarks.

### Consequences

- The operator UI shows enrolment progress as "N / 3 embeddings"
  with a clear "active when ≥ 3" threshold (Tag 5 implementation).
- Tag 13 ROC evaluation runs the recognition path at multiple values
  of N (1–5) and plots FAR/FRR per identity — the multi-embedding
  argument shown empirically. Expected gain: ROC-AUC +0.01–0.03
  between N=1 and N=5 on a small in-house dataset.
- Recognition pseudocode (Tag 6 implementation):
  ```sql
  WITH knn AS (
    SELECT poi_id, embedding <=> $probe AS dist
    FROM face_embeddings
    ORDER BY dist LIMIT 5
  ),
  by_poi AS (
    SELECT poi_id, COUNT(*) AS votes,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dist) AS median_dist
    FROM knn GROUP BY poi_id
  )
  SELECT poi_id, votes, median_dist
  FROM by_poi
  ORDER BY votes DESC, median_dist ASC LIMIT 1;
  ```

---

## ADR-9 — Auth verification via Supabase JWT Signing Keys (asymmetric, JWKS)

**Status:** accepted (2026-04-25). Supersedes the HS256 / `SUPABASE_JWT_SECRET`
verification path declared in ADR-2 consequences and implemented on Tag 3.

### Context

Tag 3 implemented the Express auth middleware against `SUPABASE_JWT_SECRET`
using `jsonwebtoken` and `algorithms: ["HS256"]`. The middleware passed
all unit tests (we signed our own HS256 tokens with the same secret) and
the RLS suite passed. Live smoke-test against the Supabase project
failed: every real session token returned `401 invalid_token`.

Investigation: in 2024-Q4 Supabase rotated the entire access-token
signing infrastructure to **JWT Signing Keys** — asymmetric keypairs
(ES256 by default, RS256 optional) whose **public** halves are exposed
at:

```
${SUPABASE_URL}/auth/v1/.well-known/jwks.json
```

The legacy `SUPABASE_JWT_SECRET` HMAC value is still visible in the
project dashboard but is **no longer used to sign new sessions**. It
survives only for internal Supabase service-to-service signing on
legacy projects. Verification on every Supabase project that has
migrated to JWT Signing Keys must read the JWKS and verify against
the public key whose `kid` matches the access token's header.

### Decision

Verify access tokens with **`jose.jwtVerify`** against
**`createRemoteJWKSet`** pointing at the project's JWKS URL. Algorithms
allowed: `["RS256", "ES256"]`.

```ts
const jwks = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL), {
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
  timeoutDuration: 5_000,
});

const { payload } = await jwtVerify(token, jwks, {
  algorithms: ["RS256", "ES256"],
});
```

`createRemoteJWKSet` ships a built-in cache (10-min default) and a
30-second cooldown for unknown `kid` values. A single key rotation
upstream therefore costs at most one cooldown window of `unknown_kid`
failures. No external cache infrastructure (Redis) is involved on the
auth hot path.

`SUPABASE_JWT_SECRET` becomes **optional** in the environment schema.
It is not consulted by any code path in the production verification
flow. It survives in `env.ts` as a documentation breadcrumb only — for
the unlikely case that Supabase offers reverse-migration to HS256, or
that dual-stack verification becomes desirable.

### Test strategy

Production verifies against `createRemoteJWKSet`. Tests inject a
`createLocalJWKSet` over an in-memory ES256 keypair via the
`setJwksForTests()` hook in `auth/jwt.ts`. Two keypairs are generated:
one whose public half is in the test JWKS (positive case), one whose
public half is not (proves `kid` mismatch is rejected). Five tests
cover: valid token accepted, foreign-key rejected, expired rejected,
malformed payload rejected, missing bearer rejected.

The local JWKS pattern means no fetch interception, no MSW, no nock —
just two functions from `jose`. Setup is 30 lines.

### Consequences

- Removed `jsonwebtoken` and `@types/jsonwebtoken` from server deps.
  Added `jose` (~30 KB minified, native crypto, zero runtime deps).
- The middleware is now `async`. Express 5 handles async middleware
  natively, but errors must still go through `try/catch`.
- First request after server start triggers a JWKS fetch (logged once).
  All subsequent requests reuse the in-memory cache.
- Error classification distinguishes `token_expired` ·
  `invalid_signature` · `unknown_kid` · `jwks_unreachable` ·
  `invalid_claims` · `invalid_token_payload` · `invalid_token` · each
  maps to a specific `joseErrors` subclass.

### Verification (post-fix smoke test, 2026-04-25)

Sign-in via `POST ${SUPABASE_URL}/auth/v1/token?grant_type=password` on
the live project returns an access token with header
`alg=ES256, kid=58b16d1a-2ee7-4508-b9cc-920767d27e75, typ=JWT`. The
JWKS endpoint publishes that exact `kid`
(`alg=ES256, kty=EC, crv=P-256, use=sig`).

```
$ curl /api/me -H "Authorization: Bearer ${ACCESS_TOKEN}"
{"sub":"2ec6c43e-f378-4295-b39e-2d3a30bbee0f",
 "email":"hawramimohammed@gmail.com",
 "role":"authenticated"}
HTTP_CODE: 200
```

All 9 server tests pass (5 JWT against local JWKS, 4 RLS against live
Supabase).

---

## ADR-7 — Supabase Realtime as the only push channel (events + fusion_layers)

**Status:** accepted (2026-04-25). Implemented Tag 6 for `events`;
re-used Tag 8/9 for `fusion_reports` + `fusion_layers`.

### Context

The operator UI watches two real-time data streams:

1. **Patrol Mode events** — when a face is matched against the POI
   database, an `events` row appears and the operator should see it
   without a page refresh.
2. **Sniper Mode layer results** — when a fusion layer (Identity / Web
   Presence / Geographic / Authenticity) finishes, its `fusion_layers`
   row updates and the dashboard column flips from `running` to
   `done` (or `failed`) with its measured latency.

Two production-grade options:

- **Self-hosted WebSocket / SSE hub** — Express maintains a ws
  registry, every router publishes to it after a successful insert,
  the frontend subscribes per channel.
- **Supabase Realtime** — Postgres `postgres_changes` events are
  multiplexed by Supabase and delivered to subscribers via WebSocket
  to the browser, RLS-gated.

### Decision

Use Supabase Realtime exclusively. Migration `0004_rls_policies.sql`
adds `events`, `fusion_reports`, `fusion_layers` to the
`supabase_realtime` publication. The frontend subscribes per concern:

```ts
supabase
  .channel("argus-events")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) =>
    onInsert(payload.new),
  )
  .subscribe();
```

### Consequences

- **Zero new infrastructure.** No ws server, no broker, no protocol
  to maintain. The Patrol page (Tag 6) and the Sniper dashboard
  (Tag 9) share the exact same mechanism.
- **RLS-gated by default.** Realtime delivers only rows the caller
  could SELECT via the anon key. An operator never sees another
  operator's resolved-by-someone-else event arriving on their stream.
- **Source of truth = the row, not the message.** A subscriber that
  misses a delivery (network blip, page reload) re-fetches via
  `supabase.from("events").select(...)` on mount. The Realtime push
  is a hint, not a primary; the database is the canonical state.
- **Event-feed UX is `INSERT`-only.** Tag 6 implementation watches
  inserts. Resolutions (`UPDATE` of `status`) propagate only on
  page refresh — sufficient for an operator who is the one issuing
  the resolve. Tag 9 may add `UPDATE` subscriptions if the Sniper
  dashboard wants live-streamed layer transitions.
- **Patrol Mode debouncing happens server-side** (30 s window per
  poi+camera, replaced by ByteTrack's per-track dedup at Tag 7).
  Without it, a person standing still in front of the camera at
  3 fps would generate one `events` row per frame, flooding the
  Realtime channel.

### Verification (Tag 6)

`/api/recognize` end-to-end test against the live Supabase project:
Patrol page subscribes, Patrol-mode webcam frame produces a face,
recognition match writes `events`, Realtime push delivers to the
subscribed feed table within < 200 ms. The same channel is reused
in `pages/Events.tsx` for the audit-trail page.

---

## ADR-8 — Vanilla CSS Modules + Radix primitives over Tailwind / shadcn

**Status:** accepted (2026-04-25)

### Context

Plan §6 makes the design phase **skill-driven**: Phase 1 produces a
manifesto and a token table, Phase 2 produces page specs in two distinct
aesthetic archetypes (industrial-brutalist for the operator surface,
premium minimalist for the public surface), Phase 3 generates components
from those tokens, Phase 4 polishes for accessibility.

The dominant 2026 React stack — Tailwind + shadcn/ui — neutralises this
process at every step:

- **Tailwind** ships its own opinionated token system (`text-slate-900`,
  `rounded-lg`, `shadow-md`, `gap-4`). A Tag 2 manifesto that says "no
  pure black, hazard-red as the only chromatic accent, generous mono
  numerals, zero border-radius on operator surfaces" gets eroded the
  moment a developer reaches for `text-black`, `rounded-lg`, or
  `shadow-md` because those are the path of least resistance.
- **shadcn/ui** ships Radix-primitive-wrapped components with default
  Tailwind classes. The "look" of a `Button` or `Dialog` is already
  decided. Customising it past the defaults is more work than writing the
  component from scratch — and the resulting component is a fork of a
  fork, not a first-class member of the design system.
- The `design-taste-frontend` skill's anti-slop fences (no Inter, no
  AI-purple gradients, no `shadow-md` overuse, no `rounded-full` pills)
  cannot be enforced by lint when the code is `<Button variant="default">` —
  the offence is hidden inside `node_modules`.

We need a stack where (a) tokens are the single source of truth, (b) the
look of every component is declared in code we own, (c) lint can refuse
raw hex codes and pixel values outside the token file, and (d) the skill
phases are visible in the file system (DESIGN.md → tokens.css → component
CSS modules → ADRs).

### Decision

**Vanilla CSS Modules + Radix UI primitives + `cva` + `clsx` +
`modern-normalize`.**

| Concern                  | Tool                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens                   | CSS Custom Properties on `:root` and `[data-theme=…]` (`tokens.css`)                                                                               |
| Reset                    | `modern-normalize` plus a brutalist-hardened reset (`reset.css`)                                                                                   |
| Component CSS            | One `*.module.css` file per `*.tsx` component, scoped automatically by Vite                                                                        |
| Component behaviour      | Radix UI primitives (`@radix-ui/react-{dialog,dropdown-menu,tabs,...}`) — accessibility and keyboard handling, **no styling**                      |
| Variant management       | `class-variance-authority` (`cva`) for components with multiple visual variants (Button: primary/secondary/ghost/destructive)                      |
| Class composition        | `clsx` for conditional class names                                                                                                                 |
| Anti-pattern enforcement | Stylelint with `color-no-hex`, `unit-allowed-list` excluding `px` outside `tokens.css`/`reset.css`/`app.css`, `declaration-no-important`. CI gate. |

### Consequences

- The cost is real: every component is built twice (TSX file + CSS module
  file), and developers must learn the token vocabulary instead of relying
  on Tailwind's mnemonic shortcuts. Maintenance overhead is non-zero.
- The benefit is the project's identity: design decisions documented in
  DESIGN.md flow without leakage into tokens.css, then into component CSS.
  The defence demonstrates a single source of truth — Stylelint
  literally fails the build if a developer types `#fff` outside the
  whitelist. That is hard to argue against.
- Radix primitives carry the accessibility (focus management, Esc-to-close,
  Tab order, ARIA attributes) so we do not reinvent them. We get
  `frontend-design`-grade interactivity without the look-and-feel of
  shadcn defaults.
- When Tag 12 produces components via `frontend-design` and
  `ui-ux-pro-max`, those skills' output lands in our own `Button.tsx +
Button.module.css` pairs — not as configurations against an external
  library. The deliverable is owned end-to-end.
- Bunny Fonts is loaded at runtime via `@import url(…)` in `app.css` for
  Tag 2 visual review. Tag 14 (`impeccable`) replaces it with `@font-face`
  on bundled woff2 files — the runtime CDN dependency is not part of the
  shipped artefact.

This decision is irreversible by accident: removing CSS Modules in favour
of Tailwind would require deleting every `*.module.css` file, rewriting
every component class, and re-running every skill phase. Doing so would
take longer than implementing the project from scratch.

---

## Future ADRs (placeholders)

The following ADRs will be written when their topic is implemented.
Listed here so the table of contents matches the plan.

- ADR-3 — Track-then-Recognize over frame-by-frame recognition (Tag 7)
- ADR-6 — Layer fanout with circuit breaker and cost guard (Tag 8)
