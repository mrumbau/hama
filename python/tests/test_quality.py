"""Pure-logic tests for the quality gate.

No InsightFace model load — every test hand-builds DetectedFace
instances. Confirms the reason-code surface is stable and complete.
"""

from __future__ import annotations

import numpy as np

from argus_ml.config import get_settings
from argus_ml.face import Bbox, DetectedFace
from argus_ml.quality import check_quality


def make_face(
    *,
    short_edge: int = 200,
    blur_var: float = 250.0,
    yaw_deg: float = 0.0,
    det_score: float = 0.95,
) -> DetectedFace:
    return DetectedFace(
        bbox=Bbox(x=10, y=10, w=short_edge, h=short_edge),
        det_score=det_score,
        yaw_deg=yaw_deg,
        blur_var=blur_var,
        landmarks=[(0.0, 0.0)] * 5,
        embedding=np.zeros(512, dtype=np.float32),
    )


def test_passes_for_clean_single_face():
    res = check_quality([make_face()])
    assert res.passes is True
    assert res.reasons == []
    assert res.metrics["face_count"] == 1.0
    assert res.metrics["face_size_px"] == 200.0
    assert res.face is not None


def test_no_face():
    res = check_quality([])
    assert res.passes is False
    assert res.reasons == ["no_face"]
    assert res.metrics == {}
    assert res.face is None


def test_multiple_faces():
    a = make_face(short_edge=100)
    b = make_face(short_edge=200)
    res = check_quality([a, b])
    assert res.passes is False
    assert res.reasons == ["multiple_faces"]
    # Largest face is reported in metrics + face slot
    assert res.metrics["face_size_px"] == 200.0
    assert res.face is b


def test_face_too_small():
    s = get_settings()
    res = check_quality([make_face(short_edge=s.QUALITY_MIN_FACE_PX - 1)])
    assert res.passes is False
    assert "face_too_small" in res.reasons


def test_too_blurry():
    s = get_settings()
    res = check_quality([make_face(blur_var=s.QUALITY_MIN_BLUR_VAR - 1)])
    assert res.passes is False
    assert "too_blurry" in res.reasons


def test_pose_extreme_positive_yaw():
    s = get_settings()
    res = check_quality([make_face(yaw_deg=s.QUALITY_MAX_POSE_YAW_DEG + 1)])
    assert res.passes is False
    assert "pose_extreme" in res.reasons


def test_pose_extreme_negative_yaw():
    s = get_settings()
    res = check_quality([make_face(yaw_deg=-(s.QUALITY_MAX_POSE_YAW_DEG + 1))])
    assert res.passes is False
    assert "pose_extreme" in res.reasons


def test_multiple_reasons_combined():
    s = get_settings()
    res = check_quality(
        [
            make_face(
                short_edge=s.QUALITY_MIN_FACE_PX - 10,
                blur_var=s.QUALITY_MIN_BLUR_VAR - 10,
                yaw_deg=s.QUALITY_MAX_POSE_YAW_DEG + 10,
            )
        ]
    )
    assert res.passes is False
    assert set(res.reasons) == {"face_too_small", "too_blurry", "pose_extreme"}


def test_metrics_always_present_when_face_detected():
    res = check_quality([make_face()])
    assert "face_count" in res.metrics
    assert "face_size_px" in res.metrics
    assert "blur_var" in res.metrics
    assert "pose_yaw_deg" in res.metrics
    assert "det_score" in res.metrics
