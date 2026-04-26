# Argus — Evaluation

The defence relies on three quantitative claims (plan §8 + §13):

| Claim                                                     | Target | Status         |
| --------------------------------------------------------- | ------ | -------------- |
| ROC-AUC on the in-house mini-set                          | > 0.97 | Tag 13 backlog |
| Latency breakdown — Sniper Mode total                     | < 10 s | Tag 13 backlog |
| Tracking speedup (Patrol Mode, with vs without ByteTrack) | 5–8×   | Tag 13 backlog |

This document tracks the evaluation work item-by-item. Sections marked
**[BACKLOG]** are scheduled for Tag 13. Sections without that tag are
verified.

---

## [BACKLOG] Quality-gate calibration (Tag 13, drives D-015 closure)

### Why it exists

The quality gate's three thresholds — `QUALITY_MIN_FACE_PX=112`,
`QUALITY_MIN_BLUR_VAR=40` (post-D-015), `QUALITY_MAX_POSE_YAW_DEG=45`
— are heuristics. The blur threshold in particular was originally
tuned for DSLR-class sources and over-rejected smartphone selfies
that ArcFace embeds robustly. D-015 lowered the default from 80 to
40 based on a small sample; Tag 13 substitutes empirical evidence.

### Method

1. Collect ~30 selfies from real operators (consented, retained
   under existing POI bucket rules). Mix of front-cam and rear-cam,
   indoor + outdoor, with-glasses and without, range of skin tones
   and ages.
2. For each photo, log:
   - `blur_var` from `face._laplacian_blur_var` on the central-60%
     bbox crop (the post-D-015 metric)
   - operator's manual label: "good photo" vs "I would not enrol this"
   - downstream cosine similarity to a paired reference photo of
     the same person (proxy for ArcFace robustness)
3. Plot the histogram of `blur_var` per label class. Pick the
   threshold at the 5th percentile of the "good" class — minimises
   FRR (false-reject rate) on photos a human operator wants to
   enrol.
4. Cross-check: the rejected "bad" photos must also show degraded
   cosine similarity (`< 0.7`) — otherwise the gate is rejecting
   photos the recogniser would have handled fine.

### Output artefacts (committed to `docs/figures/`)

- `quality_blur_histogram.png` — overlaid histograms of
  `blur_var` per label, with the chosen threshold drawn as a
  vertical line.
- `quality_blur_vs_cosine.png` — scatter of `blur_var` against
  cosine-similarity-to-reference. Confirms the chosen threshold
  is on the correct side of the recogniser-robustness drop-off.

### Production alternative (defence-of-the-defence)

A heuristic Laplacian variance is the simplest face-quality signal
that runs without a model. Production-grade recognition systems use
**face-image-quality** networks trained end-to-end against
recogniser robustness:

- **SDD-FIQA** (Stochastic Embedding Robustness, FG 2021) — small
  net that scores a cropped face on its expected ArcFace robustness.
  Trained using stochastic embedding sampling — no human label
  needed.
- **CR-FIQA** (Certainty-Ratio FIQA, CVPR 2023) — successor that
  predicts the certainty ratio of a face's similarity to its own
  class against impostor classes; has lower FRR than SDD-FIQA at
  fixed FAR on the standard benchmarks.

Either of these would replace `_laplacian_blur_var` + the
`QUALITY_MIN_BLUR_VAR` threshold with a single predicted score.
They are model-based (~5-10 MB ONNX), so they would land alongside
buffalo_l in the InsightFace folder and run in the same Python
worker. See D-015 for the architectural acceptance.

---

## [BACKLOG] ROC curve on the in-house mini-set (Tag 13)

### Method

1. Recruit ~30 identities (team + co-students who consent), 5
   photos each. Held-out test set is a different photo per identity
   captured the same day — pose / lighting variance baseline.
2. Brute-force all (probe, gallery) pairs. Record cosine similarity
   for each.
3. Sweep the threshold from 0 to 1, plot ROC. Compute AUC. Target
   > 0.97 (plan §8).
4. Compare against:
   - N=1 enrolment (single embedding per identity)
   - N=3 enrolment (median-of-top-3 voting per ADR-4)
   - N=5 enrolment (median-of-top-5)

### Expected gain (ADR-4 thesis)

ROC-AUC should rise by 0.01–0.03 between N=1 and N=5, and FRR at
fixed FAR=0.1% should fall by ~30%. The plot is the empirical
defence of the multi-embedding decision.

### Output artefacts

- `roc_per_n.png` — three ROC curves overlaid (N=1, 3, 5).
- `far_frr_at_threshold.png` — FAR/FRR table at the chosen
  operating point, with comparison rows for each N.

---

## [BACKLOG] Latency breakdown — Sniper Mode (Tag 13)

### Why a stacked bar

Plan §11 explicitly forbids "Layer-Latenz hinter Spinner verstecken".
The Sniper UI already shows per-layer `t+Xms` tickers; the
defence-thesis chart turns the same numbers into a **stacked bar**
showing what each layer contributes to total report latency.

### Method

1. Pick 10 query photos (varied content — face, clean upload, blurry,
   multi-face).
2. Run each through `/api/sniper/run` (Tag 8 implementation) with
   per-layer latency captured in `fusion_layers.latency_ms`.
3. Stacked-bar plot: x-axis = query, y-axis = ms, stacked
   contributions for the 4 layers. Annotate the slowest layer
   on each bar.
4. Side-by-side: a hypothetical sequential variant (sum of layer
   latencies) vs the actual parallel variant (max). The parallel
   bar should be ~3-4× shorter.

### Output artefacts

- `sniper_latency_stacked.png` — the defence headline chart.
- `sniper_latency_table.csv` — raw per-layer numbers per query.

---

## [BACKLOG] Tracking speedup (Tag 13)

### Method

1. Record 60 s of webcam footage with one face in frame, one
   walk-out / walk-in, one second face.
2. Run the recording through `/api/recognize` two ways:
   - Tag 6 path: detect+embed+kNN every frame.
   - Tag 7 path: ByteTrack-gated, embed only on new tracks.
3. Compare wall-clock total + cumulative event count. Tracking
   should reduce embed calls by ~80% and free CPU for higher fps.

### Expected outcome

5–8× reduction in `embed` calls; total fps cap rises from ~3 fps
to ≥ 8 fps for 1–2 faces.

### Output artefacts

- `tracking_speedup.png` — bar chart of frames-per-second
  with vs without tracking.
- `tracking_dedup.png` — event count comparison (without =
  saturated by debounce, with = clean per-track).

---

## [BACKLOG] Patrol Mode E2E latency, hosted vs Docker-local (Tag 13)

D-013 reports a hosted-Supabase recognise-call total of 949 ms
(380 ml-detect + 379 kNN + 0 insert), versus the §8 target of
< 250 ms. Tag 13 reruns the same 100-frame benchmark against a
Docker-local Postgres.

### Output artefact

- `patrol_latency_hosted_vs_local.png` — side-by-side bar chart
  with the 250 ms target line drawn across.

---

## Verified results

_(none yet — populated as each Tag-13 item lands)_
