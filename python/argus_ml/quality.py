"""Quality gate.

Plan §3 (POI enrolment): face size ≥ 112px, blur < threshold, pose-yaw
< 45°. We additionally surface "no_face" and "multiple_faces" so the
operator UI can react with a precise message instead of a generic 422.

Reason codes (stable strings — used by the Tag 5 enrolment UI to
choose a specific copy block):
  no_face            no face detected at any score
  multiple_faces     more than one face detected
  face_too_small     short bbox edge < QUALITY_MIN_FACE_PX
  too_blurry         Laplacian variance < QUALITY_MIN_BLUR_VAR
  pose_extreme       |yaw| > QUALITY_MAX_POSE_YAW_DEG
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
    if f.blur_var < s.QUALITY_MIN_BLUR_VAR:
        reasons.append("too_blurry")
    if abs(f.yaw_deg) > s.QUALITY_MAX_POSE_YAW_DEG:
        reasons.append("pose_extreme")

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
