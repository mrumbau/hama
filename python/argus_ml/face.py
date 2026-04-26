"""InsightFace wrapper — singleton with lifespan-managed warmup.

Plan §5: detector RetinaFace + recognizer ArcFace 512-D, both shipped in
the buffalo_l pack. We wrap once and reuse — model load is ~5-10s and
must not happen on a hot path.

This module is import-free of FastAPI. The lifespan hook in main.py
calls get_face_app() during startup; routes call it during requests
and reuse the cached singleton.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from loguru import logger

from .config import get_settings


# ── Public types ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Bbox:
    x: int
    y: int
    w: int
    h: int

    @property
    def area(self) -> int:
        return max(0, self.w) * max(0, self.h)

    @property
    def short_edge(self) -> int:
        return min(self.w, self.h)


@dataclass(frozen=True)
class DetectedFace:
    """Per-face record returned by detect()."""

    bbox: Bbox
    det_score: float
    yaw_deg: float
    blur_var: float
    landmarks: list[tuple[float, float]]  # 5-point: L-eye, R-eye, nose, L-mouth, R-mouth
    embedding: np.ndarray | None  # 512-D float32 (None if /detect-only)


# ── Singleton ──────────────────────────────────────────────────────────────


_face_app: FaceAnalysis | None = None
_lock = threading.Lock()


def get_face_app() -> FaceAnalysis:
    """Return the cached FaceAnalysis singleton, loading on first call.

    Thread-safe under a coarse lock — model load is one-shot. After
    initialisation, FaceAnalysis itself is safe for concurrent .get().
    """
    global _face_app
    if _face_app is not None:
        return _face_app

    with _lock:
        if _face_app is not None:
            return _face_app
        s = get_settings()
        logger.info(
            f"Loading InsightFace pack={s.INSIGHTFACE_MODEL_PACK} "
            f"det_size={s.INSIGHTFACE_DET_SIZE}",
        )
        app = FaceAnalysis(
            name=s.INSIGHTFACE_MODEL_PACK,
            providers=["CPUExecutionProvider"],
        )
        app.prepare(ctx_id=0, det_size=(s.INSIGHTFACE_DET_SIZE, s.INSIGHTFACE_DET_SIZE))
        _face_app = app
        logger.info("InsightFace ready")
        return _face_app


# ── Detection + per-face metric extraction ─────────────────────────────────


def _bbox_from_raw(raw: Any) -> Bbox:
    x1, y1, x2, y2 = (int(round(v)) for v in raw)
    return Bbox(x=x1, y=y1, w=max(0, x2 - x1), h=max(0, y2 - y1))


# Eye-region rectangle dimensions, expressed as multiples of the inter-eye
# distance (iod = abs(right_eye.x - left_eye.x)). Centred on the midpoint
# between the two eye landmarks. 1.6 × iod horizontal × 1.0 × iod vertical
# covers eyes + nose bridge + upper cheeks — the depth plane that always
# falls inside the in-focus foreground of a Portrait/Cinematic Mode photo.
_EYE_REGION_HALF_W_RATIO = 0.8  # half-width in units of iod (→ 1.6×iod total)
_EYE_REGION_HALF_H_RATIO = 0.5  # half-height in units of iod (→ 1.0×iod total)

# Legacy: bbox-central-60% inset, retained for the no-kps fallback path.
# RetinaFace from buffalo_l always emits 5-point kps, so this fallback is
# theoretical — kept only because detect_faces() is library-typed against
# arbitrary detectors that might not.
_BLUR_CROP_INSET = 0.20


def _eye_region_blur_var(image_bgr: np.ndarray, kps: np.ndarray) -> float:
    """Laplacian variance on the eye-region rectangle defined by the
    5-point landmarks (kps[0] = left eye, kps[1] = right eye).

    Why eye-region and not bbox-central-60%
    --------------------------------------
    Modern smartphone Portrait Mode / Cinematic Mode photos have a
    graduated background blur: the face is sharp, the bbox edges
    fade into bokeh. Even the central 60% of a tight RetinaFace
    bbox can include hair / collar pixels that the depth-of-field
    softened — those zero-frequency regions drag the bbox-mean
    Laplacian variance below the threshold even when the face
    itself is in perfect focus.

    The eye region is guaranteed in-focus: the auto-focus point on
    every modern phone camera lands on the eyes. It is also the
    spatial region with the highest *useful* high-frequency content
    in a face — eyelashes, iris detail, eyebrow hair — which gives
    a robust Laplacian signal that survives sensor smoothing. See
    DECISIONS.md D-015 for the full rationale.
    """
    if kps is None or len(kps) < 2:
        return 0.0

    left_eye = kps[0]
    right_eye = kps[1]

    iod = float(abs(right_eye[0] - left_eye[0]))
    if iod < 1.0:
        return 0.0

    cx = (float(left_eye[0]) + float(right_eye[0])) / 2.0
    cy = (float(left_eye[1]) + float(right_eye[1])) / 2.0

    half_w = _EYE_REGION_HALF_W_RATIO * iod
    half_h = _EYE_REGION_HALF_H_RATIO * iod

    h_img, w_img = image_bgr.shape[:2]
    x1 = max(0, int(round(cx - half_w)))
    y1 = max(0, int(round(cy - half_h)))
    x2 = min(w_img, int(round(cx + half_w)))
    y2 = min(h_img, int(round(cy + half_h)))

    if x2 <= x1 or y2 <= y1:
        return 0.0

    return _laplacian_blur_var(image_bgr[y1:y2, x1:x2])


def _crop_for_blur(img: np.ndarray, bbox: Bbox) -> np.ndarray:
    """Fallback: central-60% bbox crop for cases where keypoints are absent.

    Used only when a detector emits no usable kps. RetinaFace always does,
    so this path is theoretical — the unit tests still cover it as a
    correctness anchor in case the codebase ever switches detectors.
    """
    h_img, w_img = img.shape[:2]
    inset_x = int(bbox.w * _BLUR_CROP_INSET)
    inset_y = int(bbox.h * _BLUR_CROP_INSET)
    x1 = max(0, bbox.x + inset_x)
    y1 = max(0, bbox.y + inset_y)
    x2 = min(w_img, bbox.x + bbox.w - inset_x)
    y2 = min(h_img, bbox.y + bbox.h - inset_y)
    if x2 <= x1 or y2 <= y1:
        return np.zeros((1, 1), dtype=np.uint8)
    return img[y1:y2, x1:x2]


def _laplacian_blur_var(crop_bgr: np.ndarray) -> float:
    if crop_bgr.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _yaw_from_kps(kps: np.ndarray) -> float:
    """Estimate yaw in degrees from the 5-point landmarks.

    Heuristic: the horizontal offset of the nose tip from the midpoint of
    the eyes, normalised by the inter-eye distance, scales linearly to
    yaw. Empirically: at full 90° profile the nose is approximately at
    one eye, giving |offset| ≈ 0.5 → yaw ≈ ±90°. So scale by 180.
    Returns 0 if kps are degenerate.
    """
    if kps is None or len(kps) < 3:
        return 0.0
    left_eye = kps[0]
    right_eye = kps[1]
    nose = kps[2]
    inter_eye = float(abs(right_eye[0] - left_eye[0]))
    if inter_eye < 1.0:
        return 0.0
    eye_mid_x = (left_eye[0] + right_eye[0]) / 2.0
    offset = (nose[0] - eye_mid_x) / inter_eye
    return float(np.clip(offset * 180.0, -90.0, 90.0))


def _to_detected(raw_face: Any, image_bgr: np.ndarray, with_embedding: bool) -> DetectedFace:
    bbox = _bbox_from_raw(raw_face.bbox)
    kps = getattr(raw_face, "kps", None)
    yaw_deg = _yaw_from_kps(kps) if kps is not None else 0.0
    # Prefer eye-region blur (D-015 v2): robust against Portrait Mode bokeh
    # and the bbox-edge-blur problem the central-60% crop only partly solved.
    # RetinaFace always emits 5-point kps; the bbox fallback exists only for
    # alternative detectors that might not.
    if kps is not None and len(kps) >= 2:
        blur_var = _eye_region_blur_var(image_bgr, kps)
    else:
        blur_var = _laplacian_blur_var(_crop_for_blur(image_bgr, bbox))
    landmarks: list[tuple[float, float]] = (
        [(float(p[0]), float(p[1])) for p in kps] if kps is not None else []
    )
    embedding = None
    if with_embedding:
        emb = getattr(raw_face, "normed_embedding", None)
        if emb is None:
            emb = getattr(raw_face, "embedding", None)
        if emb is not None:
            embedding = np.asarray(emb, dtype=np.float32)
    return DetectedFace(
        bbox=bbox,
        det_score=float(getattr(raw_face, "det_score", 1.0)),
        yaw_deg=yaw_deg,
        blur_var=blur_var,
        landmarks=landmarks,
        embedding=embedding,
    )


def detect_faces(
    image_bgr: np.ndarray,
    *,
    with_embeddings: bool = False,
) -> list[DetectedFace]:
    """Run RetinaFace + (optionally) ArcFace on the given BGR ndarray.

    Returns every face whose detector confidence ≥ DETECTOR_MIN_SCORE.
    Order is whatever InsightFace returns — typically by detection score.
    Filtering by quality is the caller's responsibility (quality.py).
    """
    s = get_settings()
    raw_faces = get_face_app().get(image_bgr)
    out: list[DetectedFace] = []
    for f in raw_faces:
        score = float(getattr(f, "det_score", 0.0))
        if score < s.DETECTOR_MIN_SCORE:
            continue
        out.append(_to_detected(f, image_bgr, with_embedding=with_embeddings))
    return out


def best_face(faces: list[DetectedFace]) -> DetectedFace | None:
    """Pick the largest-area face. Plan §3 enrolment + §3 sniper-query both use this."""
    if not faces:
        return None
    return max(faces, key=lambda f: f.bbox.area)
