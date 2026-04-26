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

## Future ADRs (placeholders)

The following ADRs will be written when their topic is implemented.
Listed here so the table of contents matches the plan.

- ADR-3 — Track-then-Recognize over frame-by-frame recognition (Tag 7)
- ADR-4 — Multiple embeddings per POI, median-of-top-K voting (Tag 5)
- ADR-5 — RLS as second line of defence (Tag 3)
- ADR-6 — Layer fanout with circuit breaker and cost guard (Tag 8)
- ADR-7 — Supabase Realtime as the only push channel, also for Sniper layer streaming (Tag 9)
- ADR-8 — Vanilla CSS Modules + Radix Primitives over Tailwind/shadcn (Tag 2)
