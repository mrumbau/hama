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

## [BACKLOG] CR-FIQA evaluation vs `det_score`-only baseline (Tag 13, drives D-017 closure)

### Why it exists

The Laplacian-blur axis was retired in **D-017** after four
iterations (Tag 4 full-bbox / D-015 v1 central-60% / D-015 v2
eye-region / D-016 threshold-relax) all converged on the same
ceiling: the discriminative range between "sharp" and "slightly
soft" on modern computational-photography output is only ~5–15
variance points — too narrow for a hard-reject classifier. The
post-D-017 gate keeps four layered axes: `face_size`, `pose_yaw`,
`det_score`, and the implicit `face_count` check.

The open question for Tag 13 is whether a **learned face-image-
quality network** has a wider discriminative margin on the same
input distribution than `det_score` alone. If yes, the gate gets a
fifth axis — but as a learned score, not as a hand-tuned Laplacian
threshold.

### Candidate replacement

- **CR-FIQA** (Certainty-Ratio FIQA, CVPR 2023) — predicts the
  certainty ratio of a face's similarity to its own class against
  impostor classes. Outperforms SDD-FIQA at fixed FAR on the
  standard FIQA benchmarks. ~5-10 MB ONNX, runs in the same Python
  worker alongside buffalo_l.
- **SDD-FIQA** (Stochastic Embedding Robustness, FG 2021) —
  predecessor; included as a secondary baseline for the ROC plot.

### Method

1. Collect ~30 selfies from real operators (consented, retained
   under existing POI bucket rules). Mix of front-cam and rear-cam,
   indoor + outdoor, with-glasses and without, range of skin tones
   and ages.
2. For each photo, log:
   - `det_score` from RetinaFace
   - `blur_var` from `face._eye_region_blur_var` (already in
     `metrics["blur_var"]` post-D-017 — kept for this exact purpose)
   - **CR-FIQA score** from the loaded ONNX model
   - **SDD-FIQA score** for comparison
   - operator's manual label: "good photo" vs "I would not enrol this"
   - downstream cosine similarity to a paired reference photo of
     the same person (proxy for ArcFace robustness)
3. Plot ROC curves on the binary "good vs bad" task for four
   classifiers:
   - `det_score`-only (the post-D-017 baseline)
   - `blur_var`-only (the retired Laplacian axis, for reference)
   - `cr_fiqa`-only
   - `sdd_fiqa`-only
4. **Decision criterion.** CR-FIQA must beat the `det_score`
   baseline by a measurable margin (AUC ≥ +0.03, or FRR @ FAR=1%
   reduced by ≥ 25%) to justify adding it to the gate. If CR-FIQA
   only matches `det_score`, the gate stays at four axes — the cost
   of a new model load is not worth a marginal AUC improvement.

### Output artefacts (committed to `docs/figures/`)

- `quality_roc_per_axis.png` — overlaid ROC curves for the four
  candidate signals on the operator-labelled set. Headline figure.
- `quality_score_vs_cosine.png` — scatter of each candidate score
  against cosine-similarity-to-reference. Confirms the score is on
  the correct side of the recogniser-robustness drop-off.
- `quality_axis_decision.md` — one-paragraph defence note recording
  the AUC / FRR numbers and the resulting gate decision (axis added
  vs declined).

### Production framing (defence-of-the-defence)

This is the explicit "iterate until you have evidence to commit"
loop the project plan §13 calls for. Four heuristic iterations on
Laplacian variance produced enough data to falsify the approach;
the next change is gated on a learned score outperforming the
existing `det_score` axis on real measurements, not on intuition
about which algorithm "should" be better.

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

## [BACKLOG] Tracking speedup + visual stability (Tag 13, drives ADR-3 closure)

### Why both axes

ADR-3's two value claims are independent and must both be measured:

1. **Speedup** — the ArcFace inference + pgvector kNN cost gets
   skipped on cache hits, so the same Patrol session should sustain
   a higher frame rate (or the same frame rate at lower CPU). The
   numerical claim is **5–8×** reduction in ArcFace calls per stable
   second-of-track.
2. **Visual stability** — the bbox overlay is React-keyed by
   `track_id` and the per-track embedding cache means the
   match-status doesn't flicker frame-to-frame. The qualitative
   claim is **"cyan stays cyan"** through small RetinaFace bbox
   reorderings that the Tag 6 path rendered as colour flicker.

### Method (speedup)

1. Record 60 s of webcam footage covering: one face, one walk-out /
   walk-back-in, one second face entering, both faces leaving.
   Save the raw frames as a numbered JPEG sequence so both runs see
   identical input.
2. Replay the sequence through `/api/recognize` twice:
   - **Tag 6 baseline** — checkout the pre-Tag-7 commit that runs
     `ml.detect(with_embeddings=true)` + 30 s time-window debounce.
   - **Tag 7 ADR-3 path** — current `master`, `ml.recognizeTracked`
     + per-track cache + track-keyed dedup.
3. For each run, log per-frame:
   - `latency_ms.{detect, knn, total}` (already in the response)
   - `ml_metrics.{embeds_fresh, embeds_recycled}` (Tag 7 only —
     Tag 6 reports `embeds_fresh = faces` always)
4. Aggregate:
   - Total ArcFace inferences per run = `Σ embeds_fresh`.
     Speedup = `baseline_count / tag7_count`. Target ≥ 5×.
   - Mean per-frame total latency. Tag 7 should be lower on the
     stable-track frames, identical on cache-miss frames.
   - Sustained fps on a fixed CPU budget (run with the frame loop
     emitting as fast as it can; report end-to-end fps).

### Method (visual stability)

1. Pick the same recording. Run both Tag 6 and Tag 7 paths against
   the live Patrol UI and capture screen recordings.
2. For each recording, count colour transitions on the rendered
   bbox over a 30 s clip — every cyan→white→cyan or
   confirmed→unknown→confirmed flicker is a transition. Tag 7 should
   show **0 spurious transitions** under stable tracking; Tag 6
   shows ≥ N (estimated 5-15 per minute on a moving subject).
3. Side-effect check: the `event_id` field in `RecognizeFace.match`
   is non-null exactly once per `(poi, track)`. Subsequent frames
   for the same track return `event_id: null` (dedup hit). Tag 6
   on the same recording produces 1 event then nothing for 30 s,
   then the cycle repeats — track-keyed dedup makes this audit-
   correct without timing assumptions.

### Output artefacts (committed to `docs/figures/`)

- `tracking_speedup.png` — stacked bar: ArcFace-call count and
  mean per-frame ms, Tag 6 vs Tag 7. Headline figure for the
  speedup claim.
- `tracking_fps.png` — sustained fps (line chart over 60 s) on a
  fixed-CPU run, Tag 6 vs Tag 7.
- `tracking_dedup.png` — event-row timeline for both runs. Tag 6
  shows the time-window saw-tooth; Tag 7 shows clean per-track
  edges.
- `tracking_visual_stability.md` — frame-grab + transition-count
  table from the screen recordings. Defends the qualitative
  "cyan stays cyan" claim with a hard number.

### Decision criterion

ADR-3 is "validated" when:

- ArcFace-call reduction ≥ 5× on the stable-track segment of the
  recording (i.e. excluding the walk-out/walk-back-in transitions).
- Track-keyed dedup is "audit-correct": each distinct track entry
  produces exactly one event row.
- Visual transition count under stable tracking is 0.

If any criterion fails, the ADR-3 follow-up issue is:
"investigate cache TTL / lost_track_buffer / IoU threshold tuning"
before claiming the Tag 7 contract holds.

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
