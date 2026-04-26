"""ML routes: /detect /embed /quality.

Plan §13 Tag 4 gate:
  - `make ml.test` green
  - `curl :8001/embed` with a demo photo returns a 512-D vector

The endpoints share a single image input shape (ImageInput.image_b64)
so the Express orchestrator can carry one helper for all three calls.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .face import best_face, detect_faces, detect_only, embed_face_at
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
    RecognizeTrackedInput,
    RecognizeTrackedResponse,
    TrackedFaceOut,
)
from .tracking import (
    get_cached_embedding,
    set_cached_embedding,
    update_tracks,
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


# ── Tag 7 (ADR-3): Track-then-Recognize ─────────────────────────────────────


@router.post("/recognize-tracked", response_model=RecognizeTrackedResponse)
def recognize_tracked(req: RecognizeTrackedInput) -> RecognizeTrackedResponse:
    """Patrol Mode hot path with ByteTrack + per-track embedding cache.

    Pipeline per frame:
      1. detect_only(image)             — RetinaFace, no embedding
      2. update_tracks(state_key, dets) — ByteTrack assigns stable IDs
      3. for each tracked face:
           - cache hit + fresh? → reuse embedding (embedding_recycled=True)
           - else                → embed_face_at + cache it
      4. Return faces with track_id + embedding (always populated).

    The Express orchestrator runs pgvector kNN against the returned
    embeddings, then INSERTs into events with track-keyed dedup. See
    ADR-3 for the full architecture.
    """
    img = _decode_or_422(req.image_b64)

    detections = detect_only(img.bgr)
    assignments = update_tracks(req.tracker_state_key, detections)

    embeds_fresh = 0
    embeds_recycled = 0
    out: list[TrackedFaceOut] = []

    for assignment in assignments:
        face = detections[assignment.detection_index]
        track_id = assignment.track_id

        cached = get_cached_embedding(req.tracker_state_key, track_id)
        if cached is not None:
            embedding = cached.embedding
            recycled = True
            age_ms = int(round(cached.age_s * 1000))
            embeds_recycled += 1
        else:
            embedding = embed_face_at(img.bgr, face)
            set_cached_embedding(req.tracker_state_key, track_id, embedding)
            recycled = False
            age_ms = 0
            embeds_fresh += 1

        out.append(
            TrackedFaceOut(
                bbox=BboxOut(
                    x=face.bbox.x, y=face.bbox.y, w=face.bbox.w, h=face.bbox.h
                ),
                det_score=face.det_score,
                yaw_deg=face.yaw_deg,
                blur_var=face.blur_var,
                landmarks=[[lm[0], lm[1]] for lm in face.landmarks],
                embedding=embedding.astype(float).tolist(),
                track_id=track_id,
                embedding_recycled=recycled,
                embedding_age_ms=age_ms,
            )
        )

    return RecognizeTrackedResponse(
        faces=out,
        image={"width": img.width, "height": img.height},
        tracker_state_key=req.tracker_state_key,
        metrics={
            "detections": len(detections),
            "tracked": len(assignments),
            "embeds_fresh": embeds_fresh,
            "embeds_recycled": embeds_recycled,
        },
    )
