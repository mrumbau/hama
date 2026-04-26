"""Pure-logic tests for the quality gate + the blur helpers.

No InsightFace model load — every test hand-builds DetectedFace
instances or feeds a synthetic ndarray to the helpers. Confirms:
  * Reason-code surface is stable and complete.
  * Central-60%-of-bbox crop math (legacy fallback path for D-015 v1).
  * Eye-region crop math + Portrait-Mode robustness (D-015 v2).

Note: D-017 disabled the Laplacian-blur axis on the gate path. The
former gate tests (`test_too_blurry`, the synthetic Gaussian-blur
end-to-end test) are kept under @pytest.mark.skip so they remain
runnable for the Tag 13 FIQA benchmark, where they get re-enabled
against a learned face-image-quality score. The eye-region helper
tests stay live — they verify the metric computation, which still
runs for the metrics dict.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from argus_ml.config import get_settings
from argus_ml.face import (
    Bbox,
    DetectedFace,
    _crop_for_blur,
    _eye_region_blur_var,
    _laplacian_blur_var,
)
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


@pytest.mark.skip(reason="disabled per D-017, kept for Tag 13 FIQA benchmark")
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
    """Three-axis violation. The blur axis was removed in D-017; this
    is the post-D-017 reason set."""
    s = get_settings()
    res = check_quality(
        [
            make_face(
                short_edge=s.QUALITY_MIN_FACE_PX - 10,
                yaw_deg=s.QUALITY_MAX_POSE_YAW_DEG + 10,
                det_score=s.DETECTOR_QUALITY_MIN - 0.1,
            )
        ]
    )
    assert res.passes is False
    assert set(res.reasons) == {
        "face_too_small",
        "pose_extreme",
        "low_confidence_detection",
    }


def test_blur_var_does_not_drive_gate_post_d017():
    """A face that would have failed the D-016 gate (blur_var below the
    old 30 floor) but passes everything else is now accepted. Locks in
    the D-017 contract."""
    res = check_quality([make_face(blur_var=5.0)])
    assert res.passes is True
    assert "too_blurry" not in res.reasons
    # blur_var still surfaces in metrics for the FIQA benchmark.
    assert res.metrics["blur_var"] == 5.0


def test_low_confidence_detection():
    """det_score below the enrolment-quality floor fails the gate even
    when every other dimension (size, blur, pose) passes. Catches
    RetinaFace mis-detections on hands or occluded faces (D-016)."""
    s = get_settings()
    res = check_quality([make_face(det_score=s.DETECTOR_QUALITY_MIN - 0.05)])
    assert res.passes is False
    assert "low_confidence_detection" in res.reasons


def test_high_confidence_detection_passes_floor():
    """A face exactly at the floor passes (boundary is inclusive)."""
    s = get_settings()
    res = check_quality([make_face(det_score=s.DETECTOR_QUALITY_MIN)])
    assert "low_confidence_detection" not in res.reasons


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


# ── Eye-region blur (D-015 v2 anti-regression) ─────────────────────────────


def _eye_kps(cx: float, cy: float, iod: float) -> np.ndarray:
    """5-point keypoints with the two eyes spaced `iod` pixels apart and
    the nose / mouth landmarks placed plausibly. Only kps[0..1] are read
    by `_eye_region_blur_var`; the rest exist for shape compatibility."""
    return np.array(
        [
            [cx - iod / 2.0, cy],  # left eye
            [cx + iod / 2.0, cy],  # right eye
            [cx, cy + iod * 0.6],  # nose
            [cx - iod * 0.4, cy + iod * 1.2],  # left mouth
            [cx + iod * 0.4, cy + iod * 1.2],  # right mouth
        ],
        dtype=np.float32,
    )


def test_eye_region_returns_zero_when_kps_missing_or_degenerate():
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    # No kps
    assert _eye_region_blur_var(img, None) == 0.0  # type: ignore[arg-type]
    # Empty kps
    assert _eye_region_blur_var(img, np.empty((0, 2))) == 0.0
    # Eyes at the same x → iod < 1
    degenerate = np.array([[50.0, 50.0], [50.0, 50.0]], dtype=np.float32)
    assert _eye_region_blur_var(img, degenerate) == 0.0


def test_eye_region_robust_to_portrait_mode_bokeh():
    """The motivation for D-015 v2 in a single test.

    Build a 600×600 image: a sharp high-frequency rectangle that fully
    contains the eye-region rectangle (1.6×iod × 1.0×iod), and a flat
    grey background everywhere else. The full bbox crop is dominated
    by the flat grey → low Laplacian. The eye-region crop lives
    entirely inside the high-frequency rectangle → high Laplacian. A
    naïve bbox-mean metric would reject this photo as "too blurry";
    the eye-region metric accepts it correctly.
    """
    rng = np.random.default_rng(13)
    h_img = w_img = 600
    img = np.full((h_img, w_img, 3), 128, dtype=np.uint8)

    # Eyes at (300, 300) with iod=80 → eye-region rect = x [236,364] × y [260,340].
    cx, cy, iod = 300.0, 300.0, 80.0
    # Sharp rectangle generously containing the entire eye region.
    sharp_x0, sharp_x1 = 220, 380
    sharp_y0, sharp_y1 = 250, 350
    img[sharp_y0:sharp_y1, sharp_x0:sharp_x1] = rng.integers(
        0, 256, size=(sharp_y1 - sharp_y0, sharp_x1 - sharp_x0, 3), dtype=np.uint8
    )

    kps = _eye_kps(cx=cx, cy=cy, iod=iod)

    # Full bbox covering the whole face area (mostly flat grey, small sharp
    # patch in the middle).
    bbox = Bbox(x=200, y=200, w=200, h=240)
    bbox_var = _laplacian_blur_var(_crop_for_blur(img, bbox))
    eye_var = _eye_region_blur_var(img, kps)

    # Eye-region sits entirely inside the sharp patch; bbox crop dilutes
    # the same sharpness with the surrounding flat grey.
    assert eye_var > bbox_var
    assert eye_var > 1000  # comfortably above any plausible threshold


def test_eye_region_correctly_flags_motion_blur_on_eyes():
    """Inverse of the Portrait-Mode test: build an image where the eye
    region is heavily blurred and the surroundings are sharp. A naïve
    bbox metric (sees the sharp surroundings) would pass the photo;
    the eye-region metric correctly reports low variance and lets the
    gate reject."""
    rng = np.random.default_rng(7)
    h_img = w_img = 600
    img = rng.integers(0, 256, size=(h_img, w_img, 3), dtype=np.uint8)

    # Eyes at (300, 300) with iod=80 → eye-region rect = x [236,364] × y [260,340].
    # Blur a generous region that fully contains it.
    blur_x0, blur_x1 = 220, 380
    blur_y0, blur_y1 = 250, 350
    sub = img[blur_y0:blur_y1, blur_x0:blur_x1]
    img[blur_y0:blur_y1, blur_x0:blur_x1] = cv2.GaussianBlur(sub, (31, 31), 15)

    kps = _eye_kps(cx=300.0, cy=300.0, iod=80.0)
    eye_var = _eye_region_blur_var(img, kps)

    # The eye region is entirely inside the heavily-blurred patch.
    # Random-noise variance after a 31-px Gaussian blur is well below
    # any plausible "sharp face" threshold.
    assert eye_var < 200


def test_eye_region_clips_to_image_bounds_when_face_partially_off_screen():
    """If the eye landmarks are near the image edge, the rectangle is
    clipped instead of crashing or returning negative-size crops."""
    img = np.full((300, 300, 3), 200, dtype=np.uint8)
    # Eyes at (290, 150) and (310, 150) — right eye hangs off the right edge.
    kps = np.array([[290.0, 150.0], [310.0, 150.0]], dtype=np.float32)
    val = _eye_region_blur_var(img, kps)
    # Result is well-defined (≥ 0) and the function returned without raising.
    assert val >= 0.0


@pytest.mark.skip(reason="disabled per D-017, kept for Tag 13 FIQA benchmark")
def test_gaussian_blurred_eye_region_drives_gate_to_too_blurry():
    """End-to-end synthetic regression for D-016. Build an image where
    the eye region is heavily Gaussian-blurred (sigma=15), measure
    eye_var with the production helper, plug that into a DetectedFace,
    and confirm `check_quality` rejects with `too_blurry`. Proves the
    final-iteration threshold (30) still catches deliberately blurred
    photos despite being permissive enough to admit modern smartphone
    computational-photography output."""
    s = get_settings()

    rng = np.random.default_rng(11)
    h_img = w_img = 600
    img = rng.integers(0, 256, size=(h_img, w_img, 3), dtype=np.uint8)
    blur_x0, blur_x1 = 220, 380
    blur_y0, blur_y1 = 250, 350
    sub = img[blur_y0:blur_y1, blur_x0:blur_x1]
    img[blur_y0:blur_y1, blur_x0:blur_x1] = cv2.GaussianBlur(sub, (31, 31), 15)

    kps = _eye_kps(cx=300.0, cy=300.0, iod=80.0)
    eye_var = _eye_region_blur_var(img, kps)
    assert eye_var < s.QUALITY_MIN_BLUR_VAR, (
        f"Synthetic Gaussian-blurred eye region scored {eye_var:.2f}; "
        f"expected < {s.QUALITY_MIN_BLUR_VAR} so the gate would reject."
    )

    res = check_quality([make_face(blur_var=eye_var)])
    assert res.passes is False
    assert "too_blurry" in res.reasons


def test_eye_region_dimensions_match_specification():
    """1.6×iod horizontal × 1.0×iod vertical, centred on the eye midpoint."""
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    # Place a high-contrast pattern outside the eye-region rectangle to
    # confirm that pixels outside the rectangle do not contribute.
    img[:, :] = 50
    kps = _eye_kps(cx=200.0, cy=200.0, iod=100.0)
    # Expected rectangle: half_w = 0.8 × 100 = 80, half_h = 0.5 × 100 = 50
    # → 120..280 × 150..250 (160×100 pixels).
    # Pixels outside this rectangle: paint with high noise.
    noise_mask = np.ones((400, 400), dtype=bool)
    noise_mask[150:250, 120:280] = False
    rng = np.random.default_rng(99)
    img[noise_mask] = rng.integers(0, 256, size=noise_mask.sum(), dtype=np.uint8).reshape(-1, 1)
    # Inside the rectangle: keep flat (no variance).
    val = _eye_region_blur_var(img, kps)
    # If the rectangle were the wrong size, exterior noise would leak
    # in and inflate variance. A correct implementation reports near-zero.
    assert val < 1.0
