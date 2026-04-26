"""Pydantic request/response schemas for the ML routes.

Wire contract used by both the Express orchestrator (Tag 5+) and pytest's
TestClient. One schema per concept — keep response shapes flat so the
TypeScript side (server/src/lib/ml-client.ts, Tag 5) can mirror them
without a generator.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Shared input ─────────────────────────────────────────────────────────


class ImageInput(BaseModel):
    image_b64: str = Field(
        ...,
        min_length=32,
        description="Base64 string. Optionally prefixed with `data:<mime>;base64,`.",
    )


class DetectInput(ImageInput):
    """Detection request with optional per-face embeddings.

    Tag 6 Patrol Mode sets with_embeddings=True so a single ML round-trip
    returns all detected faces plus their 512-D ArcFace vectors — the
    Express orchestrator runs pgvector kNN per face and posts events
    on matches. Without the flag, /detect returns lighter payloads
    (Tag 7 multi-camera matrix).
    """

    with_embeddings: bool = False


# ── Shared sub-shapes ────────────────────────────────────────────────────


class BboxOut(BaseModel):
    x: int
    y: int
    w: int
    h: int


class FaceOut(BaseModel):
    bbox: BboxOut
    det_score: float
    yaw_deg: float
    blur_var: float
    landmarks: list[list[float]]
    embedding: list[float] | None = None  # populated when with_embeddings=True


# ── /detect ──────────────────────────────────────────────────────────────


class DetectResponse(BaseModel):
    faces: list[FaceOut]
    image: dict[str, int]  # {"width": int, "height": int}


# ── /embed ──────────────────────────────────────────────────────────────


class EmbedResponse(BaseModel):
    face: FaceOut
    embedding: list[float] = Field(..., description="512-D float32 ArcFace embedding (L2-normed).")
    embedding_dim: int


# ── /quality ────────────────────────────────────────────────────────────


class QualityResponse(BaseModel):
    passes: bool
    reasons: list[str]
    metrics: dict[str, float]
    face: FaceOut | None


# ── /recognize-tracked (Tag 7, ADR-3) ───────────────────────────────────


class RecognizeTrackedInput(BaseModel):
    """Patrol Mode hot-path request.

    `tracker_state_key` is a free-form string — the Express orchestrator
    typically uses `${camera_id}` (one tracker per physical camera) or
    `${camera_id}:${session_uuid}` if it wants per-page-session state.
    Anything goes as long as the same key reaches the ML service across
    consecutive frames; ByteTrack's stable `track_id`s only persist
    within one key's state blob.
    """

    image_b64: str = Field(
        ...,
        min_length=32,
        description="Base64 string. Optionally prefixed with `data:<mime>;base64,`.",
    )
    tracker_state_key: str = Field(..., min_length=1, max_length=128)


class TrackedFaceOut(BaseModel):
    """One detection annotated with ByteTrack's stable id and ArcFace
    embedding (either freshly computed or recycled from the per-track
    cache, marked by `embedding_recycled`)."""

    bbox: BboxOut
    det_score: float
    yaw_deg: float
    blur_var: float
    landmarks: list[list[float]]
    embedding: list[float]  # always populated — recognition is the whole point
    track_id: int
    embedding_recycled: bool = Field(
        ...,
        description="True if served from cache; False if a fresh ArcFace pass ran this frame.",
    )
    embedding_age_ms: int = Field(
        ...,
        description="0 for a fresh embedding; positive for cached entries.",
    )


class RecognizeTrackedResponse(BaseModel):
    faces: list[TrackedFaceOut]
    image: dict[str, int]  # {"width": int, "height": int}
    tracker_state_key: str
    metrics: dict[str, int] = Field(
        default_factory=dict,
        description="Counters for the Tag 13 speedup measurement: "
        "`embeds_fresh`, `embeds_recycled`, `detections`, `tracked`.",
    )
