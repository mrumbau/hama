"""Pure-logic tests for the quality gate + the central-crop helper.

No InsightFace model load — every test hand-builds DetectedFace
instances or feeds a synthetic ndarray to the helpers. Confirms the
reason-code surface is stable and complete, and locks in the
central-60%-of-bbox blur crop introduced for D-015.
"""

from __future__ import annotations

import numpy as np

from argus_ml.config import get_settings
from argus_ml.face import Bbox, DetectedFace, _crop_for_blur
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


# ── Central-60% blur crop (D-015 anti-regression) ──────────────────────────


def test_crop_for_blur_returns_central_60_percent_of_bbox():
    """100×100 bbox → 60×60 crop after 20% inset on each edge."""
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    bbox = Bbox(x=50, y=50, w=100, h=100)
    crop = _crop_for_blur(img, bbox)
    assert crop.shape[:2] == (60, 60)


def test_crop_for_blur_respects_image_bounds_when_bbox_extends_outside():
    """A bbox that pokes outside the image is clipped without exploding."""
    img = np.zeros((50, 50, 3), dtype=np.uint8)
    bbox = Bbox(x=-10, y=-10, w=80, h=80)
    crop = _crop_for_blur(img, bbox)
    # bbox.w*0.2 = 16; x1 = max(0, -10+16) = 6; x2 = min(50, -10+80-16) = 50.
    # crop width = 50 - 6 = 44.
    assert crop.shape[1] == 44
    assert crop.shape[0] == 44


def test_crop_for_blur_isolates_central_signal_from_noisy_border():
    """Synthetic image: high-noise border, uniform centre.

    The full bbox would have high Laplacian variance from the border edges;
    the central crop sees only the uniform centre and reports near-zero.
    This is the D-015 motivation in a single test.
    """
    import cv2

    rng = np.random.default_rng(42)
    img = rng.integers(0, 256, size=(200, 200, 3), dtype=np.uint8)
    # Paint a uniform 120×120 centre square (covers the central 60% of a
    # full-image bbox, plus margin).
    img[40:160, 40:160] = 128
    bbox = Bbox(x=0, y=0, w=200, h=200)

    full_crop = img  # equivalent to "no inset"
    central_crop = _crop_for_blur(img, bbox)

    full_var = float(cv2.Laplacian(cv2.cvtColor(full_crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
    central_var = float(
        cv2.Laplacian(cv2.cvtColor(central_crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()
    )

    # Border noise dominates full-bbox variance; central crop sees pure flat colour.
    assert full_var > 1000
    assert central_var < 1.0
    assert central_crop.shape[:2] == (120, 120)
