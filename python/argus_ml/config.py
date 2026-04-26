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

    # ── Tracking (Tag 7, ADR-3: Track-then-Recognize) ────────────────────
    # ByteTrack frame_rate controls the lost_track_buffer (default 30
    # frames). Patrol Mode runs at ~5–10 fps, so frame_rate=10 forgives
    # ~3 seconds of occlusion before a track is reaped.
    BYTETRACK_FRAME_RATE: int = Field(default=10, ge=1, le=60)
    # TTL on the pickled tracker state in Redis. After 60s of camera
    # silence the tracker is reset — operator-recognisable identities
    # restart from track_id=1 on the next frame.
    TRACKER_STATE_TTL_S: int = Field(default=60, ge=1)
    # TTL on the per-track embedding cache.
    TRACK_EMBED_TTL_S: int = Field(default=30, ge=1)
    # Max age before a cached embedding is considered stale and must be
    # recomputed even though the cache entry still exists. Bound on how
    # long an old ArcFace vector can lag behind a person's appearance.
    TRACK_EMBED_MAX_AGE_S: float = Field(default=2.0, gt=0)

    # ── InsightFace ──────────────────────────────────────────────────────
    # buffalo_l reactivated after Render Standard Plan upgrade (2GB RAM).
    # Provides ~5% accuracy improvement over buffalo_s on cross-camera-
    # domain recognition (TAR @ FAR=1e-5 on typical smartphone inputs).
    # Pack contains R50-ArcFace (~166MB) + RetinaFace + landmark/genderage
    # nets; total resident set ~1.2–1.5GB with one uvicorn worker.
    # Embedding dimension is 512 for both packs — pgvector schema is
    # unchanged, but the embedding spaces are mathematically distinct,
    # so existing rows MUST be re-enrolled (scripts/re-enroll-all.ts).
    # Historical context: ran on buffalo_s during the Render Starter
    # (512MB) period — see DEPLOYMENT.md.
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
    # Laplacian-variance gate disabled per D-017. Default 0.0 means the
    # `too_blurry` reason never triggers — `_eye_region_blur_var` still
    # runs and the result lands in the metrics dict for the Tag 13 FIQA
    # benchmark, but it is not a gate dimension anymore. The full
    # iteration history (Tag 4 full-bbox / D-015 v1 central-60% / D-015
    # v2 eye-region / D-016 threshold-relax / D-017 disabled) lives in
    # DECISIONS.md. Set > 0 only to re-enable for legacy DSLR-class
    # inputs where the discriminative range is wider than the ~5–15
    # points we measure on modern smartphone output.
    QUALITY_MIN_BLUR_VAR: float = Field(default=0.0, ge=0)
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
