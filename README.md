# Argus

> **OSINT Fusion Engine for Face Recognition.**
> One photo in — four independent identity layers out, correlated in one report.

University project. Bachelor/Master level. Defence target: 30-minute oral.

---

## What it does

Two operational modes share one engine:

- **Sniper Mode** (investigator) — upload a face photo, four layers fan out
  in parallel, results stream into a brutalist five-column dashboard:
  1. **Identity** — pgvector kNN against own POI database
  2. **Web Presence** — SerpAPI (Google Lens + Reverse + Bing Reverse)
  3. **Geographic** — Picarta API (where was this photo taken?)
  4. **Authenticity** — Reality Defender API (deepfake / replay detection)
- **Patrol Mode** (operator) — webcam stream, multi-face tracking,
  real-time bbox overlay, alerts on POI matches via Supabase Realtime.

Both modes write to a unified `events` audit trail. Operators confirm or
dismiss matches; every action is logged with operator ID and timestamp.

---

## Stack

- **Frontend:** React 18 + Vite + TypeScript, vanilla CSS Modules with
  CSS Custom Property tokens, Radix UI primitives, `cva`, `clsx`,
  `wouter` routing, TanStack Query, Zustand. **No Tailwind, no shadcn.**
- **Backend:** Express 5 (TS, ESM), Helmet, pino, Drizzle ORM,
  `p-limit` / `p-queue` / `p-retry`, Supabase service-role client.
- **ML:** Python 3.11, FastAPI, InsightFace `buffalo_l` (RetinaFace
  detector + ArcFace 512-D embeddings), ByteTrack, Redis state cache.
- **BaaS:** Supabase hosted (Postgres + pgvector + Auth + Storage + Realtime + RLS).
- **Container:** Docker Compose v2 (Linux/amd64 pinned for InsightFace).

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full ADR set.

---

## Quickstart

> Day 1 — scaffolding only. Full quickstart lands Tag 14.

```bash
# Prerequisites: Node 20, pnpm 9, Python 3.11, Docker Desktop
nvm use && pnpm install
cp .env.example .env
cp server/.env.example server/.env       # fill in Supabase + 3 API keys
cp client/.env.example client/.env.local # fill in Supabase URL + anon key
cp python/.env.example python/.env

# After Tag 4 (ML service ready):
docker compose up -d redis ml

# After Tag 8 (server orchestrator ready):
pnpm dev
```

---

## Repository layout

```
.
├── client/        React 18 + Vite (frontend SPA)
├── server/        Express 5 + Drizzle (orchestrator)
├── shared/        Drizzle schema + Zod fusion payloads (@argus/shared)
├── python/        FastAPI ML service (RetinaFace + ArcFace + ByteTrack)
├── supabase/      Migrations (Drizzle-generated SQL + hand-written RLS)
├── docs/          ARCHITECTURE · EVALUATION · OPERATIONS · DESIGN · SECURITY · DECISIONS
├── tests/         e2e (Playwright) · fixtures · unit
└── scripts/       seed · eval-roc.py · benchmark-latency.ts
```

---

## Status

- ✅ Day 1 — Tabula rasa, scaffolding, ADR-0/1/2, decision log, dependency baseline.
- ⏳ Day 2 — Design tokens + brutalist/minimalist specs (Phase 1+2 skills).
- ⏳ Day 3 — Drizzle schema, RLS policies, custom auth form against `supabase.auth`.
- ⏳ Days 4-7 — ML service, POI enrollment, Patrol Mode, ByteTrack tracking.
- ⏳ Days 8-14 — Sniper orchestrator, layer streaming, eval, polish, demo video.

See [docs/DECISIONS.md](./docs/DECISIONS.md) for the live changelog.

---

## License

MIT.
