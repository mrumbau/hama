"""Quality gate.

Plan §3 (POI enrolment) implemented as a layered gate: face count,
face size, pose, and detector confidence. The Laplacian-blur axis was
iteratively narrowed (D-015 v1 / D-015 v2 / D-016) and finally
**removed** from the gate path in D-017 — it had a discriminative
range of only ~5-15 points between sharp and slightly-soft modern
smartphone selfies, while `det_score` discriminates much more cleanly
on the same inputs. The eye-region blur variance is still computed
and reported in `metrics["blur_var"]` for the Tag 13 FIQA benchmark
(EVALUATION.md), but it does NOT contribute to the reasons list.

Reason codes (stable strings — used by the Tag 5 enrolment UI to
choose a specific copy block):
  no_face                    no face detected at any score
  multiple_faces             more than one face detected
  face_too_small             short bbox edge < QUALITY_MIN_FACE_PX
  pose_extreme               |yaw| > QUALITY_MAX_POSE_YAW_DEG
  low_confidence_detection   det_score < DETECTOR_QUALITY_MIN
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import get_settings
from .face import DetectedFace


@dataclass(frozen=True)
class QualityResult:
    passes: bool
    reasons: list[str]
    metrics: dict[str, float]
    face: DetectedFace | None


def check_quality(faces: list[DetectedFace]) -> QualityResult:
    """Apply the Tag 5 enrolment quality gate to a detected-face list.

    Multi-face: rejected. Enrolment must be a 1:1 photo. Patrol Mode
    (multi-face recognition) does not call this gate — it consumes the
    raw detect_faces() output.
    """
    s = get_settings()

    if not faces:
        return QualityResult(passes=False, reasons=["no_face"], metrics={}, face=None)

    if len(faces) > 1:
        # Pick the largest so we can still report metrics; gate fails.
        primary = max(faces, key=lambda f: f.bbox.area)
        return QualityResult(
            passes=False,
            reasons=["multiple_faces"],
            metrics={
                "face_count": float(len(faces)),
                "face_size_px": float(primary.bbox.short_edge),
                "blur_var": float(primary.blur_var),
                "pose_yaw_deg": float(primary.yaw_deg),
                "det_score": float(primary.det_score),
            },
            face=primary,
        )

    f = faces[0]
    reasons: list[str] = []

    if f.bbox.short_edge < s.QUALITY_MIN_FACE_PX:
        reasons.append("face_too_small")
    if abs(f.yaw_deg) > s.QUALITY_MAX_POSE_YAW_DEG:
        reasons.append("pose_extreme")
    if f.det_score < s.DETECTOR_QUALITY_MIN:
        reasons.append("low_confidence_detection")
    # NOTE: D-017 removed the `too_blurry` axis. `f.blur_var` remains in
    # the metrics dict below for the Tag 13 FIQA benchmark.

    return QualityResult(
        passes=not reasons,
        reasons=reasons,
        metrics={
            "face_count": 1.0,
            "face_size_px": float(f.bbox.short_edge),
            "blur_var": float(f.blur_var),
            "pose_yaw_deg": float(f.yaw_deg),
            "det_score": float(f.det_score),
        },
        face=f,
    )
