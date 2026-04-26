# Argus — Operations

Operational concerns: resource budgets, lifecycle policies, audit
workflow, external-API cost ceilings, key rotation. Maintained as
Argus matures; written sections marked with the day they landed.

For the architectural rationale behind each choice, see
[ARCHITECTURE.md](./ARCHITECTURE.md). For per-day deviations from the
plan, see [DECISIONS.md](./DECISIONS.md).

---

## Image decode RAM budget (post-D-014)

The ML service decodes user-uploaded images via `python/argus_ml/images.py`.
Two constants govern the resource envelope:

| Constant             | Value         | Meaning                                                                                                                                         |
| -------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_PIXELS`         | `100,000,000` | Decompression-bomb defence — any image whose width × height exceeds this is rejected with `image_too_large` before it allocates a pixel buffer. |
| `RESIZE_TARGET_EDGE` | `2048`        | After load, any image whose longest edge exceeds this is downscaled in-place via `PIL.Image.thumbnail` before further processing.               |

### Worst-case RAM per decode

PIL holds a decoded image as `mode="RGB"` (3 bytes/pixel) for the
canonical path, but during conversion + manipulation the peak buffer
is RGBA (4 bytes/pixel). The headline budget at the cap:

```
100,000,000 px × 4 bytes/pixel = 400 MB peak per decode
```

After `thumbnail((2048, 2048), Image.Resampling.LANCZOS)` runs, the
working set drops to:

```
2048 × 2048 × 4 bytes = ~16 MB
```

PIL frees the original buffer at this point. The 400 MB peak is
transient (~tens of milliseconds for a 100 MP image on a CPU worker).

### Process-level budget

- `python/argus_ml/main.py` runs `uvicorn` with `--workers 2` (config
  `ML_WORKERS=2`). Two workers, each holding its own InsightFace
  model (~280 MB) and able to decode in parallel.
- Concurrent worst case: 2 × 400 MB peak decode + 2 × 280 MB model
  RAM = **~1.4 GB** under a simultaneous burst of two 100 MP uploads.
- This fits the Docker host budget set in `docker-compose.yml`
  (default 2 GB Linux container, no explicit `mem_limit`).
- Production: if a third worker is added, raise the container
  memory limit to ~2.5 GB.

### Why we accept the 400 MB peak instead of streaming

- PIL has no streaming JPEG decoder for arbitrary metadata; we have
  to materialise the pixel buffer to read EXIF + dimensions reliably.
- The 100 M cap is the upper bound on the decode pixel count, not
  the typical case. Real iPhone Pro photos at 48 MP land at
  192 MB peak — well under the cap.
- The two-layer client+server resize (D-014) means the server-decode
  hot path almost always sees a ≤ 1920 px JPEG (~ 12 MB peak) sent
  by the browser after `lib/resizeImage.ts` shrinks the source.

### Monitoring

Tag 13 wires Pino metrics for per-request decode latency and peak
memory; until then, manual `docker stats argus_ml_1` during the
demo verifies the budget holds.

---

## External API cost ceilings

Tag 8 (Sniper Mode fanout) implements a per-operator daily cost guard
in Postgres. Until then, the rate limits below are enforced
client-side via `RD_MOCK_MODE` defaults and SerpAPI key revocation
in case of abuse. Numbers are updated as the integrations land.

| Service          | Free tier            | Cap (per operator / day)              | Toggle                           |
| ---------------- | -------------------- | ------------------------------------- | -------------------------------- |
| Reality Defender | 50 scans / month     | mock by default (`RD_MOCK_MODE=true`) | env var                          |
| SerpAPI          | 100 searches / month | 5 / minute                            | server-side rate limiter (Tag 8) |
| Picarta          | 10 free credits      | 5 / minute                            | server-side rate limiter (Tag 8) |

`COST_GUARD_DAILY_EUR=2.0` (server/.env) is the upper bound a single
operator can spend across paid services per UTC day. Exceeded calls
return 429 and the corresponding fusion layer is marked `failed` in
the report.

---

## Storage lifecycle policies

Buckets are created in `supabase/migrations/0006_buckets.sql` with
`file_size_limit` and MIME constraints, but Supabase Storage
lifecycle (auto-delete after N days) is configured in the dashboard
since the SQL surface does not expose it. Apply manually after
`make db.push`:

| Bucket           | Retention                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `poi-photos`     | indefinite — manual delete via DELETE on POI cascades to embeddings; bucket cleanup is best-effort in `routes/poi.ts` |
| `event-frames`   | 30 days (operator audit window)                                                                                       |
| `sniper-queries` | 7 days (one-shot investigation queries)                                                                               |

Set in dashboard: Storage → bucket → Settings → Lifecycle Rules.

---

## Audit workflow

Per plan §10. Every Patrol-mode match writes `events`; every Sniper
run writes `fusion_reports`. Operators confirm or dismiss
`events.status` via `/events`; the resolution is RLS-gated to
`operator_id = auth.uid() OR is_admin()`. Tag 14 adds CSV export.

---

## Key rotation

If any of the following secrets is suspected of compromise, rotate
in this order:

1. `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Settings → API
   → Generate New. Update `server/.env` immediately. The old key
   stays valid for ~10 minutes during propagation.
2. `SUPABASE_JWT_SECRET` — same pane. **Important:** all active
   sessions are invalidated (per ADR-9 we verify against JWKS, but
   the secret value is what Supabase Auth signs new sessions with).
3. `RD / Picarta / SerpAPI keys` — issue new keys via each provider's
   dashboard, paste into `server/.env`, restart the server. The
   previous key is usually revocable with one click.
4. `DATABASE_URL` password — Supabase dashboard → Settings →
   Database → Reset Password. Update both `DATABASE_URL` and
   `DATABASE_DIRECT_URL` in `server/.env`. Run `make db.push` to
   confirm the new password works.

The Tag 1 D-001 entry records that the inherited `.env` had live
secrets; that file was rotated end-to-end on Tag 1 before any
further commit.
