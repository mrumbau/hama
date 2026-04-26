"""ML routes: /detect /embed /quality.

Plan §13 Tag 4 gate:
  - `make ml.test` green
  - `curl :8001/embed` with a demo photo returns a 512-D vector

The endpoints share a single image input shape (ImageInput.image_b64)
so the Express orchestrator can carry one helper for all three calls.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .face import best_face, detect_faces
from .images import ImageDecodeError, decode_image
from .quality import check_quality
from .schemas import (
    BboxOut,
    DetectInput,
    DetectResponse,
    EmbedResponse,
    FaceOut,
    ImageInput,
    QualityResponse,
)

router = APIRouter()


def _face_out(face, *, with_embedding: bool = False) -> FaceOut:
    return FaceOut(
        bbox=BboxOut(x=face.bbox.x, y=face.bbox.y, w=face.bbox.w, h=face.bbox.h),
        det_score=face.det_score,
        yaw_deg=face.yaw_deg,
        blur_var=face.blur_var,
        landmarks=[[lm[0], lm[1]] for lm in face.landmarks],
        embedding=(face.embedding.astype(float).tolist() if (with_embedding and face.embedding is not None) else None),
    )


def _decode_or_422(image_b64: str):
    try:
        return decode_image(image_b64)
    except ImageDecodeError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)}) from exc


@router.post("/detect", response_model=DetectResponse)
def detect(req: DetectInput) -> DetectResponse:
    """Multi-face detection.

    Used by Patrol Mode (with_embeddings=True so the orchestrator can run
    pgvector kNN per face in a single ML round-trip) and by the operator
    UI for bbox previews (with_embeddings=False, default).
    """
    img = _decode_or_422(req.image_b64)
    faces = detect_faces(img.bgr, with_embeddings=req.with_embeddings)
    return DetectResponse(
        faces=[_face_out(f, with_embedding=req.with_embeddings) for f in faces],
        image={"width": img.width, "height": img.height},
    )


@router.post("/embed", response_model=EmbedResponse)
def embed(req: ImageInput) -> EmbedResponse:
    """Embed the largest detected face. Used by enrolment + recognition.

    422 reason="no_face" if the detector returns nothing — caller knows
    to surface "kein Gesicht erkannt" without further inspection.
    """
    img = _decode_or_422(req.image_b64)
    faces = detect_faces(img.bgr, with_embeddings=True)
    chosen = best_face(faces)
    if chosen is None or chosen.embedding is None:
        raise HTTPException(status_code=422, detail={"error": "no_face"})

    return EmbedResponse(
        face=_face_out(chosen),
        embedding=chosen.embedding.astype(float).tolist(),
        embedding_dim=int(chosen.embedding.shape[0]),
    )


@router.post("/quality", response_model=QualityResponse)
def quality(req: ImageInput) -> QualityResponse:
    """Enrolment quality gate. Returns 200 with passes=false + reasons[]
    instead of 422 — the UI walks the operator through fixes; a server
    error code would be misleading."""
    img = _decode_or_422(req.image_b64)
    faces = detect_faces(img.bgr, with_embeddings=False)
    result = check_quality(faces)
    return QualityResponse(
        passes=result.passes,
        reasons=result.reasons,
        metrics=result.metrics,
        face=_face_out(result.face) if result.face is not None else None,
    )
