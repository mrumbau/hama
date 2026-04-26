"""Tag 7 (ADR-3) tracking + per-track embedding cache tests.

Pure-logic + fakeredis. No InsightFace model load. Synthetic
DetectedFace inputs verify:
  * Same detection across frames → same track_id (lifecycle)
  * Drop-out / re-entry → fresh track_id (track lifecycle reset)
  * Cache miss → None / cache hit fresh → returns embedding
  * Cache stale (> TRACK_EMBED_MAX_AGE_S) → returns None
  * reset_tracker wipes both tracker state and embedding cache
"""

from __future__ import annotations

import time

import fakeredis
import numpy as np
import pytest

from argus_ml.config import get_settings
from argus_ml.face import Bbox, DetectedFace
from argus_ml.tracking import (
    _set_redis_for_tests,
    get_cached_embedding,
    reset_tracker,
    set_cached_embedding,
    update_tracks,
)


@pytest.fixture(autouse=True)
def _fake_redis():
    """Inject a fakeredis client into tracking.py and clear it between tests."""
    client = fakeredis.FakeRedis(decode_responses=False)
    _set_redis_for_tests(client)
    yield client
    client.flushall()
    _set_redis_for_tests(None)


def _face(x: int, y: int, w: int = 80, h: int = 80, score: float = 0.95) -> DetectedFace:
    """Synthetic DetectedFace with the bare minimum the tracker needs."""
    return DetectedFace(
        bbox=Bbox(x=x, y=y, w=w, h=h),
        det_score=score,
        yaw_deg=0.0,
        blur_var=120.0,
        landmarks=[
            (float(x + 30), float(y + 30)),
            (float(x + 50), float(y + 30)),
            (float(x + 40), float(y + 45)),
            (float(x + 32), float(y + 60)),
            (float(x + 48), float(y + 60)),
        ],
        embedding=None,
    )


# ── Track lifecycle ────────────────────────────────────────────────────────


def test_first_frame_assigns_a_track_id():
    res = update_tracks("cam-A", [_face(100, 100)])
    assert len(res) == 1
    assert res[0].detection_index == 0
    assert res[0].track_id >= 1


def test_same_detection_across_frames_keeps_track_id():
    """The whole point of Tag 7: stable id across frames."""
    f1 = update_tracks("cam-A", [_face(100, 100)])
    f2 = update_tracks("cam-A", [_face(102, 101)])  # tiny shift, IoU > 0.9
    f3 = update_tracks("cam-A", [_face(105, 103)])
    assert f1[0].track_id == f2[0].track_id == f3[0].track_id


def test_two_distinct_faces_get_distinct_track_ids():
    res = update_tracks("cam-A", [_face(100, 100), _face(400, 100)])
    ids = sorted(r.track_id for r in res)
    assert len(ids) == 2
    assert ids[0] != ids[1]


def test_two_cameras_are_isolated():
    """Different state_keys → independent tracker instances. The
    supervision library uses a global STrack counter so we can't assert
    both cameras start at id=1 — only that each camera's track stays
    stable across its own frames (a face moving in cam-A doesn't
    leak into cam-B's state)."""
    a1 = update_tracks("cam-A", [_face(100, 100)])
    b1 = update_tracks("cam-B", [_face(400, 400)])
    a2 = update_tracks("cam-A", [_face(102, 101)])
    b2 = update_tracks("cam-B", [_face(402, 401)])
    assert a1[0].track_id == a2[0].track_id
    assert b1[0].track_id == b2[0].track_id
    # The two cameras pick distinct IDs (would only collide if state leaked).
    assert a1[0].track_id != b1[0].track_id


def test_empty_frame_does_not_crash():
    update_tracks("cam-A", [_face(100, 100)])
    res = update_tracks("cam-A", [])
    assert res == []


def test_walk_out_then_back_in_eventually_yields_a_new_track_id():
    """Lost-track-buffer is frame-rate based. With BYTETRACK_FRAME_RATE=10
    and the default 30-frame buffer, max_time_lost = int(10/30 * 30) = 10
    frames of being unmatched reaps the track. A re-entering face takes
    one or two confirmation frames to be promoted to a tracked row by
    supervision (minimum_consecutive_frames=1, but the very first frame
    after a long gap can come back as 'unconfirmed'); we feed two
    frames and assert the resulting id is different from the original."""
    first = update_tracks("cam-A", [_face(100, 100)])
    for _ in range(40):  # comfortably more than max_time_lost=10
        update_tracks("cam-A", [])
    update_tracks("cam-A", [_face(100, 100)])  # may come back unconfirmed
    second = update_tracks("cam-A", [_face(100, 100)])
    assert len(second) == 1
    assert first[0].track_id != second[0].track_id


# ── Embedding cache ────────────────────────────────────────────────────────


def test_cache_miss_returns_none():
    assert get_cached_embedding("cam-A", track_id=1) is None


def test_cache_hit_returns_embedding():
    emb = np.random.RandomState(0).rand(512).astype(np.float32)
    set_cached_embedding("cam-A", track_id=1, embedding=emb)
    cached = get_cached_embedding("cam-A", track_id=1)
    assert cached is not None
    assert cached.embedding.shape == (512,)
    assert np.allclose(cached.embedding, emb)
    assert cached.age_s < 1.0  # just stored


def test_cache_returns_none_when_age_exceeds_max():
    """Manually backdate the stored timestamp past TRACK_EMBED_MAX_AGE_S."""
    s = get_settings()
    emb = np.zeros(512, dtype=np.float32)
    # Write fresh, then overwrite the embedded_at with a past timestamp.
    set_cached_embedding("cam-A", track_id=1, embedding=emb)

    # Reach into Redis to age the entry artificially.
    import pickle as _pickle
    from argus_ml.tracking import _embed_key, get_redis

    aged_payload = {"embedding": emb, "embedded_at": time.time() - (s.TRACK_EMBED_MAX_AGE_S + 1.0)}
    get_redis().set(_embed_key("cam-A", 1), _pickle.dumps(aged_payload))

    assert get_cached_embedding("cam-A", track_id=1) is None


def test_cache_isolated_per_state_key():
    emb_a = np.full(512, 0.1, dtype=np.float32)
    emb_b = np.full(512, 0.2, dtype=np.float32)
    set_cached_embedding("cam-A", track_id=1, embedding=emb_a)
    set_cached_embedding("cam-B", track_id=1, embedding=emb_b)
    a = get_cached_embedding("cam-A", track_id=1)
    b = get_cached_embedding("cam-B", track_id=1)
    assert a is not None and np.allclose(a.embedding, emb_a)
    assert b is not None and np.allclose(b.embedding, emb_b)


def test_reset_tracker_wipes_state_and_embeddings():
    """`reset_tracker` clears Redis state for a key. The next update
    instantiates a fresh ByteTrack — supervision's STrack counter is
    global so we can't assert id=1, only that:
      (a) the Redis embedding for the previous id is gone, and
      (b) the ID assigned to a re-detected face is different from the
          pre-reset ID, proving the tracker was rebuilt rather than
          restored from cache."""
    first = update_tracks("cam-A", [_face(100, 100)])
    pre_id = first[0].track_id
    set_cached_embedding("cam-A", track_id=pre_id, embedding=np.zeros(512, dtype=np.float32))
    assert get_cached_embedding("cam-A", track_id=pre_id) is not None

    reset_tracker("cam-A")

    assert get_cached_embedding("cam-A", track_id=pre_id) is None
    res = update_tracks("cam-A", [_face(100, 100)])
    assert len(res) == 1
    assert res[0].track_id != pre_id
