# Argus — Production Deployment Guide (project-chaw.net)

Version-of-record for the day-of-defence cutover. Code-side preparation
is in the `DEPLOYMENT-READY` commit (Tag 14 / D-025); this guide is the
browser-side checklist.

> **Scope:** Single-region open-demo deployment for the oral defence.
> Reality Defender stays in mock mode; Sniper Layers 2-3 will burn
> external-API quota under public traffic — the Cost Guard caps each
> operator at €2/UTC-day to bound the blast radius.

---

## 1. Hosting Architecture

| Service           | Vendor              | URL                                  | Plan                          |
| ----------------- | ------------------- | ------------------------------------ | ----------------------------- |
| Frontend (SPA)    | Vercel              | `https://project-chaw.net`           | Hobby (free)                  |
| Express API       | Render              | `https://chaw-server.onrender.com`   | Starter ($7/mo, 512MB)        |
| Python ML         | Render              | `https://chaw-ml.onrender.com`       | Starter ($7/mo, 512MB)        |
| Redis (tracker)   | Render Key-Value    | injected as `REDIS_URL`              | Free (25MB)                   |
| Postgres + Auth + Storage + Realtime | Supabase | Mumbai (`ap-south-1`) | Free                  |
| DNS               | Mittwald            | `project-chaw.net` → Vercel CNAME    | Existing                      |

Cost: ~$14/mo for the two Render web services. Everything else is free
tier. Cleanup after the defence: delete the two Render services + the
production Supabase project; DNS records can stay pointing at Vercel
(returns 404 once the project is deleted).

---

## 2. Deploy order

The order matters because each layer's env wires into the next:

```
1. Supabase production project        → produces SUPABASE_URL, ANON, SERVICE_ROLE,
                               JWT_SECRET, DB_PASSWORD
2. Render: Redis             → produces REDIS_URL (internal)
3. Render: chaw-ml           → produces ML_BASE_URL (internal)
4. Render: chaw-server       → consumes ML_BASE_URL + Supabase + Redis
                               produces SERVER_URL (public)
5. Vercel: client            → consumes SUPABASE_URL/ANON + SERVER_URL
                               produces project-chaw.net
6. Mittwald DNS              → CNAME project-chaw.net → cname.vercel-dns.com
```

A re-deploy of any single layer does not require re-deploying the
others — the URLs and secrets stay stable.

---

## 3. Step-by-step (browser clicks)

### 3.1 Supabase production project project

1. **supabase.com → New project**, region `ap-south-1`, name
   `argus-prod`. Pick a strong DB password and store it.
2. **SQL Editor → Run** every file in `supabase/migrations/` in order.
   The local `make db.push` (= `tsx scripts/db-push.ts`) runs the same
   SQL with idempotency tracking via `__argus_migrations`; you can run
   it from your laptop pointed at the new `DATABASE_DIRECT_URL` to
   apply the full set in one shot:
   ```sh
   DATABASE_DIRECT_URL="postgresql://postgres:<PW>@db.<REF>.supabase.co:5432/postgres" \
     pnpm db:push
   ```
3. **Authentication → Providers → Email**: enable email/password.
   Disable email confirmation for the demo (operators sign in
   immediately) — *or* enable it if you want the magic-link UX.
4. **Authentication → URL Configuration**: site URL =
   `https://project-chaw.net`, redirect allow-list adds the same.
5. **Settings → API**: copy `anon`, `service_role`, and `JWT secret`
   for the env panels below.

### 3.2 Render Key-Value (Redis)

1. **render.com → New → Key Value**: name `chaw-redis`, region
   `Singapore`, free tier.
2. After provisioning, copy the **Internal Redis URL** for the
   `REDIS_URL` env var on both Render web services.

### 3.3 Render chaw-ml (Python ML)

1. **New → Web Service** → connect this Git repo, branch `main`.
2. **Configuration:**
   - Name: `chaw-ml`
   - Region: `Singapore`
   - Runtime: `Docker`
   - Dockerfile path: `python/Dockerfile`
   - Docker Build Context: `python` (the repo subdirectory)
   - Health Check Path: `/health`
   - Plan: Starter (512MB)
3. **Environment** (paste from `python/.env.production.example`):
   - `REDIS_URL` = the Internal Redis URL from §3.2
   - All other values can use the file's defaults — no secrets needed
     because the ML service is internal-only.
4. **Deploy**. First build ~6-8 min (downloads buffalo_s + bakes into
   the image). Watch logs for `argus-ml ready`. Hit
   `https://chaw-ml.onrender.com/health` from your laptop to confirm
   external reachability.

### 3.4 Render chaw-server (Express)

1. **New → Web Service** → same repo + branch.
2. **Configuration:**
   - Name: `chaw-server`
   - Region: `Singapore`
   - Runtime: `Node`
   - Build Command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @argus/server build`
   - Start Command: `pnpm --filter @argus/server start`
   - Root Directory: leave blank (repo root)
   - Health Check Path: `/api/health`
   - Plan: Starter (512MB)
3. **Environment** (paste from `server/.env.production.example`):
   - All Supabase values from §3.1
   - `DATABASE_URL` and `DATABASE_DIRECT_URL` with the production
     project's password substituted
   - `REDIS_URL` = same Internal URL as the ML service
   - `ML_BASE_URL` = `https://chaw-ml.onrender.com` (the public URL —
     Render's internal DNS works too if both services are in the
     same team, see Render docs)
   - `CORS_ORIGINS=https://project-chaw.net,https://www.project-chaw.net`
   - All four external API keys (SerpAPI, Picarta, Reality Defender)
   - `RD_MOCK_MODE=true` — non-negotiable for the demo
4. **Deploy**. First build ~3 min. Logs should end with
   `argus-server listening on host: 0.0.0.0`. Hit
   `https://chaw-server.onrender.com/api/health` to confirm.

### 3.5 Vercel client

1. **vercel.com → Add New → Project** → import this Git repo, branch
   `main`.
2. **Configuration:**
   - Framework Preset: `Other` (the included `client/vercel.json`
     handles the rewrites + headers)
   - Root Directory: leave blank (the `vercel.json` path inside the
     repo is `client/vercel.json` and is auto-detected; if Vercel
     can't find it, set Root Directory to `client/`)
   - Build Command: defined in `client/vercel.json`; can leave blank
     in the panel
   - Output Directory: defined in `client/vercel.json`
3. **Environment Variables** (paste from `client/.env.production.example`,
   scope = Production):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL=https://chaw-server.onrender.com`
4. **Deploy**. ~1 min. The first deploy emits a `*.vercel.app` URL —
   confirm it loads `/login` and you can sign in (the cross-origin
   call to `chaw-server.onrender.com` proves the CORS config works).
5. **Settings → Domains**: add `project-chaw.net` and
   `www.project-chaw.net`. Vercel will display the DNS values to set.

### 3.6 Mittwald DNS

1. **Login → Domain → project-chaw.net → DNS-Einträge.**
2. **A** record for `@` (root) → `76.76.21.21` (Vercel's anycast IP),
   *or* if you're on Vercel's recommended setup: **CNAME** for `@` →
   `cname.vercel-dns.com`. Pick whichever Vercel prompts in §3.5
   step 5 — they'll show the exact target.
3. **CNAME** for `www` → `cname.vercel-dns.com`.
4. Save. Propagation: typically 1-15 min for Mittwald, up to 24h for
   stale resolvers downstream.
5. Vercel: refresh the Domains page until both records show ✓.

---

## 4. One-shot post-deploy: Re-enrol the existing POIs

The model switch `buffalo_l` → `buffalo_s` (D-025) makes the existing
dev-corpus embeddings useless against fresh probes — the production
project starts empty. Two options:

- **Empty start (recommended for the open demo):** the demo operators
  enrol fresh photos via the UI, no migration needed.
- **Migrate dev → prod + re-enrol:** dump the dev project's
  `poi`, `face_embeddings`, and storage bucket contents, restore into
  the production project, then run:
  ```sh
  ML_BASE_URL=https://chaw-ml.onrender.com \
    DATABASE_DIRECT_URL=postgresql://postgres:<PW>@db.<PROD_REF>.supabase.co:5432/postgres \
    SUPABASE_URL=https://<PROD_REF>.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=<PROD_SERVICE_ROLE> \
    pnpm tsx scripts/re-enroll-all.ts
  ```
  The script logs `cos(old, new)` per row — typical values are 0.0–0.3
  (the new embedding space is largely orthogonal to the old one).

---

## 5. Smoke-test checklist

Run from a private/incognito window so no stale tokens leak in:

- [ ] `https://project-chaw.net/` loads — landing page renders.
- [ ] **Sign up** with a fresh email → redirected to `/poi`.
- [ ] **POI registry** renders the first-run orientation panel.
- [ ] Click `+ new poi`, enrol with one photo → tile shows enrolled
      badge after ~2-5s.
- [ ] **Patrol Mode** loads, webcam permission prompt fires, click
      `▶ start patrol` — bbox overlay appears within 2-3 frames.
- [ ] **Sniper Mode** upload — Layer 1 (Identity) goes done within
      ~3s; Layers 2-4 go done/failed within ~10s. `final_status` ends
      `complete` (or `failed` on a Picarta/SerpAPI quota outage).
- [ ] **Cost-summary widget** on `/sniper` shows `€0.13 / €2.00`
      after one Sniper run.
- [ ] **Browser DevTools → Network** filter on `chaw-server.onrender.com`
      — every authenticated request carries `Authorization: Bearer`
      and gets `200`.
- [ ] **Browser DevTools → Console** clean (no CORS errors, no
      `Mixed Content` warnings).

---

## 6. Rollback / cleanup plan

The defence runs once. Cleanup is mostly "delete the rentals":

1. **Vercel:** Settings → General → Delete Project. DNS records can
   stay or be pointed at a parking page.
2. **Render:** Delete `chaw-server`, `chaw-ml`, `chaw-redis`. Stops
   billing immediately (pro-rated).
3. **Supabase production project:** Settings → Pause project (free, keeps the
   data) or Delete Project (irreversible). For a uni-defence
   timeframe, Pause is fine.
4. **Mittwald DNS:** drop the Vercel records or repoint to a "demo
   archived" placeholder.

If something fails mid-deploy and you need to abort:

- **CORS errors** in the browser console → Render env panel,
  `CORS_ORIGINS` is missing the right host, save + redeploy.
- **502 from chaw-server** → Render logs likely show `ML_BASE_URL`
  unreachable or DB pool DNS-failed; check the env vars + the
  Supabase pooler hostname matches `aws-1-ap-south-1.pooler.supabase.com`.
- **OOM on chaw-ml** → bump to Standard (1GB) and revert
  `INSIGHTFACE_MODEL_PACK` to `buffalo_l` if you want the genauer
  Modell. The Dockerfile is unchanged; only the env var differs.
- **Cost Guard saturation** in the demo → manual SQL:
  `DELETE FROM daily_cost_ledger WHERE day_utc = (now() AT TIME ZONE 'utc')::date;`

---

## 7. Environment-variable cheat-sheet

### Vercel (Production scope)

```
VITE_SUPABASE_URL             https://<PROD_REF>.supabase.co
VITE_SUPABASE_ANON_KEY        <PROD_ANON>
VITE_API_URL                  https://chaw-server.onrender.com
```

### Render chaw-server

```
NODE_ENV                       production
LOG_LEVEL                      info
CORS_ORIGINS                   https://project-chaw.net,https://www.project-chaw.net
SUPABASE_URL                   https://<PROD_REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY      <PROD_SERVICE_ROLE>
SUPABASE_JWT_SECRET            <PROD_JWT_SECRET>
SUPABASE_DB_PASSWORD           <PROD_DB_PW>
DATABASE_URL                   postgresql://postgres.<PROD_REF>:<PW>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
DATABASE_DIRECT_URL            postgresql://postgres:<PW>@db.<PROD_REF>.supabase.co:5432/postgres
ML_BASE_URL                    https://chaw-ml.onrender.com
ML_TIMEOUT_MS                  15000
REDIS_URL                      <Render Internal Redis URL>
SERPAPI_KEY                    <key>
PICARTA_API_KEY                <key>
REALITY_DEFENDER_API_KEY       <key>
RD_MOCK_MODE                   true
COST_GUARD_DAILY_EUR           2.0
LAYER_COST_WEB_PRESENCE_EUR    0.02
LAYER_COST_GEOGRAPHIC_EUR      0.01
LAYER_COST_AUTHENTICITY_EUR    0.10
CIRCUIT_BREAKER_FAILURE_THRESHOLD  3
CIRCUIT_BREAKER_OPEN_MS        60000
POI_PHOTO_MAX_BYTES            52428800
POI_PHOTOS_MAX_PER_REQUEST     1
```

### Render chaw-ml

```
ML_HOST                        0.0.0.0
ML_WORKERS                     1
INSIGHTFACE_MODEL_PACK         buffalo_s
INSIGHTFACE_DET_SIZE           640
REDIS_URL                      <Render Internal Redis URL>
QUALITY_MIN_FACE_PX            112
QUALITY_MIN_BLUR_VAR           0.0
QUALITY_MAX_POSE_YAW_DEG       55
DETECTOR_QUALITY_MIN           0.75
DETECTOR_MIN_SCORE             0.5
BYTETRACK_FRAME_RATE           10
TRACKER_STATE_TTL_S            60
TRACK_EMBED_TTL_S              30
TRACK_EMBED_MAX_AGE_S          2.0
```
