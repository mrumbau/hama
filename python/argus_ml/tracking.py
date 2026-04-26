"""ByteTrack-backed multi-object tracker with Redis-pickled state.

Tag 7 / ADR-3: Track-then-Recognize. The Patrol Mode hot path goes:

    1. detect_only(image)              ← RetinaFace, no embedding
    2. update_tracks(state_key, dets)  ← ByteTrack assigns stable IDs
    3. for each tracked face:
         if cache_hit_and_fresh:
             reuse cached embedding
         else:
             embed_face_at(image, face) → cache → match
    4. Express runs pgvector kNN per fresh embedding only

The cache cuts the ArcFace + kNN cost on the second-frame-onwards path
of every stable track (the common case during Patrol Mode), and gives
the frontend a stable `track_id` per face so the bbox overlay can be
keyed by track instead of by frame index — that's the "cyan stays cyan"
visual stability behaviour D-012's 30s time-window debounce never had.

State storage
-------------
The pickled `supervision.ByteTrack` instance lives in Redis under
`argus:tracker:{state_key}` with a TTL of TRACKER_STATE_TTL_S. Camera
silence longer than that resets the tracker — desired behaviour for a
demo where the operator may pause for several minutes between sessions.

Per-track embeddings live under `argus:track_embed:{state_key}:{track_id}`
with TTL = TRACK_EMBED_TTL_S. Within that lifetime, anything older than
TRACK_EMBED_MAX_AGE_S is considered stale and forces a re-embed; this
bounds how long an old ArcFace vector can lag a person's actual
appearance.

Workers
-------
The Redis-pickle path means `ML_WORKERS` can stay >1 — every worker
reads/writes the same state. Worth noting: pickle/unpickle on every
request adds ~2-5ms; at Patrol's 5–10 fps that is well below the kNN
cost we save on stable tracks.
"""

from __future__ import annotations

import pickle
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np
import redis
import supervision as sv
from loguru import logger

from .config import get_settings
from .face import DetectedFace


# ── Redis client (lazy singleton) ──────────────────────────────────────────


_redis: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """Return the cached Redis client. Created on first call."""
    global _redis
    if _redis is None:
        _redis = redis.Redis.from_url(get_settings().REDIS_URL, decode_responses=False)
    return _redis


def _set_redis_for_tests(client: redis.Redis | None) -> None:
    """Inject a fakeredis client (or None to clear) for tests."""
    global _redis
    _redis = client


# ── Key builders ───────────────────────────────────────────────────────────


def _tracker_key(state_key: str) -> str:
    return f"argus:tracker:{state_key}"


def _embed_key(state_key: str, track_id: int) -> str:
    return f"argus:track_embed:{state_key}:{track_id}"


# ── Tracker state ──────────────────────────────────────────────────────────


def _new_tracker() -> sv.ByteTrack:
    s = get_settings()
    return sv.ByteTrack(frame_rate=s.BYTETRACK_FRAME_RATE)


def load_tracker(state_key: str) -> sv.ByteTrack:
    """Pull the pickled ByteTrack instance from Redis or build a fresh one.

    Resilient to unpickle errors (e.g. supervision version drift): on
    any deserialisation failure we log and return a new tracker, so a
    stale Redis blob can't poison the Patrol session.
    """
    raw = get_redis().get(_tracker_key(state_key))
    if not raw:
        return _new_tracker()
    try:
        tracker = pickle.loads(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"tracker unpickle failed for {state_key}: {exc}; resetting")
        return _new_tracker()
    if not isinstance(tracker, sv.ByteTrack):
        logger.warning(f"tracker payload for {state_key} is not ByteTrack; resetting")
        return _new_tracker()
    return tracker


def save_tracker(state_key: str, tracker: sv.ByteTrack) -> None:
    s = get_settings()
    get_redis().set(_tracker_key(state_key), pickle.dumps(tracker), ex=s.TRACKER_STATE_TTL_S)


def reset_tracker(state_key: str) -> None:
    """Wipe tracker + all per-track embeddings for the given state_key.

    Used by tests; production has no caller — TTLs handle expiry.
    """
    r = get_redis()
    r.delete(_tracker_key(state_key))
    pattern = f"argus:track_embed:{state_key}:*"
    for k in r.scan_iter(pattern):
        r.delete(k)


# ── Per-frame update ───────────────────────────────────────────────────────


@dataclass
class TrackAssignment:
    """One detection's slot after tracker update.

    `detection_index` is the position of the source detection in the
    list passed to `update_tracks`. `track_id` is ByteTrack's stable
    identifier across frames. Both are needed for the route handler:
    detection_index lets it pick up the original DetectedFace (with
    landmarks for embed_face_at), track_id keys the embedding cache.
    """

    detection_index: int
    track_id: int


def update_tracks(
    state_key: str,
    detections: list[DetectedFace],
) -> list[TrackAssignment]:
    """Update the ByteTrack instance with a fresh detection list and
    return one TrackAssignment per detection that the tracker accepted.

    A detection may be dropped if ByteTrack's confidence floor rejects
    it (track_activation_threshold default 0.25 — well below our
    DETECTOR_MIN_SCORE=0.5 floor in face.py, so in practice every
    detection we feed in survives, but we still match defensively
    rather than assume).
    """
    tracker = load_tracker(state_key)
    if not detections:
        # Tick the tracker with empty input so its lost-track ageing
        # advances; otherwise a quiet camera frame keeps tracks alive
        # forever.
        empty = sv.Detections.empty()
        tracker.update_with_detections(empty)
        save_tracker(state_key, tracker)
        return []

    xyxy = np.array(
        [
            [d.bbox.x, d.bbox.y, d.bbox.x + d.bbox.w, d.bbox.y + d.bbox.h]
            for d in detections
        ],
        dtype=np.float32,
    )
    confidence = np.array([d.det_score for d in detections], dtype=np.float32)
    sv_dets = sv.Detections(
        xyxy=xyxy,
        confidence=confidence,
        class_id=np.zeros(len(detections), dtype=int),
    )

    tracked = tracker.update_with_detections(sv_dets)
    save_tracker(state_key, tracker)

    if len(tracked) == 0 or tracked.tracker_id is None:
        return []

    # ByteTrack returns rows in the same order as the input detections it
    # accepted, but does not annotate which input index each row came
    # from. Match by IoU back to the source — small lists (≤ a handful
    # of faces per frame) so O(N²) is fine.
    assignments: list[TrackAssignment] = []
    used_inputs: set[int] = set()
    for i in range(len(tracked)):
        track_xyxy = tracked.xyxy[i]
        best_idx, best_iou = -1, -1.0
        for j, d in enumerate(detections):
            if j in used_inputs:
                continue
            d_xyxy = (
                float(d.bbox.x),
                float(d.bbox.y),
                float(d.bbox.x + d.bbox.w),
                float(d.bbox.y + d.bbox.h),
            )
            iou = _bbox_iou(d_xyxy, track_xyxy)
            if iou > best_iou:
                best_idx, best_iou = j, iou
        if best_idx >= 0 and best_iou > 0.5:
            used_inputs.add(best_idx)
            assignments.append(
                TrackAssignment(
                    detection_index=best_idx,
                    track_id=int(tracked.tracker_id[i]),
                )
            )
    return assignments


def _bbox_iou(a: tuple[float, float, float, float], b) -> float:
    """IoU between two boxes in (x1, y1, x2, y2) form. `b` is np-indexable."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = float(b[0]), float(b[1]), float(b[2]), float(b[3])
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    a_area = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    b_area = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = a_area + b_area - inter
    return inter / union if union > 0 else 0.0


# ── Per-track embedding cache ──────────────────────────────────────────────


@dataclass
class CachedEmbedding:
    embedding: np.ndarray
    embedded_at: float  # unix seconds

    @property
    def age_s(self) -> float:
        return time.time() - self.embedded_at


def get_cached_embedding(state_key: str, track_id: int) -> CachedEmbedding | None:
    """Return the cached ArcFace embedding for the track, or None if
    missing or stale beyond TRACK_EMBED_MAX_AGE_S."""
    s = get_settings()
    raw = get_redis().get(_embed_key(state_key, track_id))
    if not raw:
        return None
    try:
        data = pickle.loads(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"cached embedding unpickle failed (track {track_id}): {exc}")
        return None
    emb = data.get("embedding")
    ts = data.get("embedded_at")
    if emb is None or ts is None:
        return None
    cached = CachedEmbedding(embedding=np.asarray(emb, dtype=np.float32), embedded_at=float(ts))
    if cached.age_s > s.TRACK_EMBED_MAX_AGE_S:
        return None
    return cached


def set_cached_embedding(state_key: str, track_id: int, embedding: np.ndarray) -> None:
    s = get_settings()
    payload = {
        "embedding": embedding.astype(np.float32),
        "embedded_at": time.time(),
    }
    get_redis().set(
        _embed_key(state_key, track_id),
        pickle.dumps(payload),
        ex=s.TRACK_EMBED_TTL_S,
    )
