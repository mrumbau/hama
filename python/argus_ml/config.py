"""Argus ML config — pydantic-settings env loader.

Single source of truth for runtime knobs. Read once at startup; never
re-read process.env elsewhere. Quality thresholds live here so a single
operator decision propagates through the test suite + the running
service without restarts of the test fixtures.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Service ──────────────────────────────────────────────────────────
    ML_HOST: str = "0.0.0.0"
    ML_PORT: int = 8001
    ML_WORKERS: int = 2

    # ── Redis (Tag 7: ByteTrack state cache) ────────────────────────────
    REDIS_URL: str = "redis://127.0.0.1:6379"

    # ── InsightFace ──────────────────────────────────────────────────────
    INSIGHTFACE_MODEL_PACK: str = "buffalo_l"
    INSIGHTFACE_DET_SIZE: int = 640
    # Detector confidence threshold for accepting a face at all.
    DETECTOR_MIN_SCORE: float = Field(default=0.5, ge=0, le=1)

    # ── Quality gate (rejected enrolment photos = a hard 422) ────────────
    # Minimum face size in pixels (shorter bbox edge).
    QUALITY_MIN_FACE_PX: int = Field(default=112, gt=0)
    # Minimum Laplacian-variance on the face crop. Higher = sharper.
    # Below this threshold = "too blurry".
    QUALITY_MIN_BLUR_VAR: float = Field(default=80.0, gt=0)
    # Maximum absolute yaw in degrees (0 = frontal; ±90 = profile).
    QUALITY_MAX_POSE_YAW_DEG: float = Field(default=45.0, gt=0, le=90)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
