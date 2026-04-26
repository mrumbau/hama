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
    # Detector admission floor — RetinaFace keeps any face scored at or
    # above this. Permissive (0.5) so Patrol Mode still sees marginal
    # faces in low-light webcam frames; the enrolment-side quality gate
    # tightens this further via DETECTOR_QUALITY_MIN below.
    DETECTOR_MIN_SCORE: float = Field(default=0.5, ge=0, le=1)

    # ── Quality gate (rejected enrolment photos = a hard 422) ────────────
    # Minimum face size in pixels (shorter bbox edge).
    QUALITY_MIN_FACE_PX: int = Field(default=112, gt=0)
    # Minimum Laplacian variance on the EYE REGION (1.6×iod horizontal ×
    # 1.0×iod vertical, centred on the eye midpoint). 30 is the final
    # iteration after empirical observation on real iPhone computational-
    # photography selfies, which produce eye-region variance ~80–200
    # despite passing visual inspection. Earlier values (150 in v2, 40 in
    # v1, 80 in Tag 4) were too strict for modern smartphone output.
    # See DECISIONS.md D-016 for the full calibration history; Tag 13
    # substitutes with an empirical threshold from a 30-selfie histogram
    # (EVALUATION.md backlog "Quality-gate calibration").
    QUALITY_MIN_BLUR_VAR: float = Field(default=30.0, gt=0)
    # Maximum absolute yaw in degrees (0 = frontal; ±90 = profile).
    # 55° gives more pose tolerance than the conservative 45° default
    # without admitting near-profile shots that hurt embedding quality.
    QUALITY_MAX_POSE_YAW_DEG: float = Field(default=55.0, gt=0, le=90)
    # Quality-gate detector-confidence floor for enrolment. Faces
    # detected at det_score in [DETECTOR_MIN_SCORE, DETECTOR_QUALITY_MIN)
    # are admitted by the detector (so Patrol Mode sees them) but
    # rejected by the enrolment gate. Catches RetinaFace mis-detections
    # on hands, occluded faces, and extreme low-light captures before
    # they pollute the embedding bank.
    DETECTOR_QUALITY_MIN: float = Field(default=0.75, ge=0, le=1)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
