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
