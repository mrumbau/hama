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

## Quality-gate blur metric — robustness to modern smartphone modes

> **Status (D-017):** the Laplacian-blur axis is **disabled on the
> gate path**. Iteration concluded — Laplacian variance was deemed
> unsuitable for computational-photography era smartphone inputs (the
> discriminative range between "sharp" and "slightly soft" measured
> ~5–15 variance points, too narrow for a robust hard-reject). The
> eye-region helper still runs and the variance still lands in
> `metrics["blur_var"]` for the Tag 13 FIQA benchmark; this section
> is retained as historical context for the iteration ladder. See
> DECISIONS.md D-017 for the full retirement rationale.

The blur metric used by `quality.py` was iteratively hardened against
the failure modes of real-world phone-camera output. The post-D-015 v2
implementation measured Laplacian variance on the **eye region** — a
rectangle of size `1.6 × iod × 1.0 × iod` centred on the midpoint of
the two eye landmarks (`iod` = inter-eye distance in pixels).

### Why eye-region beats bbox-based metrics

| Camera mode / artefact                                                         | Bbox metric (full or central-60%)                                                              | Eye-region metric                                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **iPhone Portrait Mode** — sharp face, graduated bokeh on collar / ears / hair | Bbox-mean Laplacian dragged down by bokeh pixels at the bbox edges → false `too_blurry` reject | Crop sits entirely inside the in-focus foreground — bokeh outside the eye rectangle has no effect                                       |
| **Cinematic Mode** (video / variable depth-of-field)                           | Same as Portrait Mode — bbox edges fade out of focus during a "rack focus"                     | Eye region remains in focus across the entire DoF transition (focus point is the eyes by design)                                        |
| **Front-cam sensor smoothing** (iPhone, Samsung selfie cam)                    | Smooth-skin cheek pixels lower mean variance regardless of true sharpness                      | Eyelash / iris / eyebrow detail is richer than skin texture, so survives smoothing with a higher signal                                 |
| **Hair / textured wall in the bbox margin**                                    | High-contrast edges inflate variance independently of face sharpness                           | Margin pixels are excluded from the crop entirely                                                                                       |
| **Real motion blur on the face**                                               | Detected (full-face soft)                                                                      | **Still detected** — the test `test_eye_region_correctly_flags_motion_blur_on_eyes` confirms blurred-eyes images are correctly rejected |

The defence framing is deliberate: "smarter than naïve Laplacian"
does **not** mean "more permissive". The eye-region metric is
_better targeted_. It rejects motion-blurred eyes at the same
specificity as the bbox metric and accepts in-focus faces that the
bbox metric incorrectly rejected.

### Threshold drift across iterations

| Day      | Crop region                    | `QUALITY_MIN_BLUR_VAR` | Reason for the change                                                                                                                                                                       |
| -------- | ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag 4    | Full bbox                      | 80                     | Initial DSLR-calibrated heuristic                                                                                                                                                           |
| D-015 v1 | Central 60% × 60%              | 40                     | Smartphone selfies were rejected at 80; the central crop excluded hair/wall edges that inflated variance                                                                                    |
| D-015 v2 | Eye region (1.6×iod × 1.0×iod) | 150                    | Portrait Mode bokeh contaminated even the central-60% crop; the eye region is guaranteed in-focus                                                                                           |
| D-016    | Eye region (unchanged)         | 30                     | Real iPhone computational-photography selfies measure ~80–200 on the eye region — 150 was rejecting visually sharp faces. Algorithm kept; threshold drops to fit the empirical distribution |
| **D-017**    | **disabled**                       | **0.0**                    | **Iteration concluded — Laplacian deemed unsuitable for computational-photography era smartphone inputs. Ground-truth datapoint: clean iPhone selfie scores `blur_var = 35`, only 5 points above the post-D-016 threshold. `det_score` (0.81 for the same photo) covers the same failure modes with a wider margin.** |

Two further enrolment-side thresholds were added in D-016 alongside
the blur drop:

| Constant                  | Value | Purpose                                                                                                                                  |
| ------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `QUALITY_MAX_POSE_YAW_DEG` | 55    | Up from 45. Admits natural near-frontal angles; ArcFace 512-D is robust at this bound. Tighter than near-profile, which hurts embedding quality. |
| `DETECTOR_QUALITY_MIN`     | 0.75  | New. Quality-gate floor on RetinaFace `det_score`. Catches mis-detections (hands, occluded faces, low light) before they enrol. Distinct from `DETECTOR_MIN_SCORE = 0.5` which is the admission floor inside `detect_faces` and stays permissive so Patrol still sees marginal frames. |

Tag 13 EVALUATION.md backlog "Quality-gate calibration" replaces
`blur_var` on the gate with **CR-FIQA** (production-grade learned
face-image-quality score), evaluated against a `det_score`-only
baseline on the 30-selfie corpus. If CR-FIQA shows a materially
wider FRR/FAR margin than `det_score` alone, the gate gets that
axis back — as a learned score, not as a Laplacian threshold.

### Operator-facing reason copy

Post-D-017 reason codes surfaced to the UI:

| Code                       | Meaning                                                  |
| -------------------------- | -------------------------------------------------------- |
| `no_face`                  | RetinaFace returned no detections                        |
| `multiple_faces`           | More than one face in an enrolment photo                 |
| `face_too_small`           | Short bbox edge < 112 px                                 |
| `pose_extreme`             | \|yaw\| > 55°                                            |
| `low_confidence_detection` | RetinaFace `det_score` < 0.75                            |

The legacy `too_blurry` code is retired with D-017 — the server no
longer emits it. The client's `describeReason` fallback surfaces
the raw code if it ever appears in an old fusion report.

---

## External API cost ceilings (Tag 8a — DB-backed)

The cost guard (Tag 8a, ADR-6) caps each operator's per-UTC-day
external-API spend at `COST_GUARD_DAILY_EUR` (server/.env, default
**€2.00**). The library is wired (`lib/cost-guard.ts`) and tested but
no orchestrator path calls it yet — Tag 8b's Layer 2/3/4 dispatch
will be the first caller.

| Service          | Free tier            | Cost-guard service id | Default per-call cost |
| ---------------- | -------------------- | --------------------- | --------------------- |
| Reality Defender | 50 scans / month     | `reality_defender`    | mock = 0.00 € · real  |
| SerpAPI          | 100 searches / month | `serpapi`             | TBD (Tag 8b)          |
| Picarta          | 10 free credits      | `picarta`             | TBD (Tag 8b)          |

### Runtime behaviour

- `chargeOrReject(operatorId, service, costEur)` runs as a single
  CTE-wrapped UPSERT against `daily_cost_ledger`. The post-charge
  total is computed inside the same statement, so two concurrent
  Sniper runs cannot both squeak past the cap.
- Rejection: the layer is marked `failed` with
  `error_message = "cost_guard_exceeded"`. The report still includes
  the other layers' results (per ADR-6's partial-failure framing).
- Reset cadence: rows are not deleted at end-of-day. The query
  filter `day_utc = (now() AT TIME ZONE 'utc')::date` rolls the
  budget over naturally. Old rows accumulate and form the audit log
  the Tag 14 admin dashboard reads.
- Read access: operators see their own row via the
  `daily_cost_ledger_select_own_or_admin` RLS policy. Admins see
  every operator's via `is_admin()`. Service-role writes only.

### Circuit breakers

Per-service in-process state machines
(`lib/circuit-breaker.ts`). Defaults from `server/.env`:

- `CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3` consecutive failures trip
  the breaker.
- `CIRCUIT_BREAKER_OPEN_MS = 60_000` — open window. After 60 s the
  next call is a half-open probe; success resets to closed,
  failure stays open and restarts the timer.

A tripped breaker rejects without invoking the upstream — the layer
is marked `failed` with `error_message = "circuit_open"`. The
operator sees an explicit "upstream cooling down" badge instead of
waiting for the upstream timeout (which would be ML_TIMEOUT_MS plus
fetch overhead per attempt).

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
