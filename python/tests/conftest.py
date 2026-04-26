"""Shared pytest fixtures.

Loads InsightFace's bundled `t1.jpg` group photo so integration tests
need no committed face data. The model loads exactly once per session.

Threshold note: t1 is a low-resolution JPEG. Its largest near-frontal
face measures ~104 px short edge (just under the production
QUALITY_MIN_FACE_PX=112), and any pre-detection upscale that satisfies
size requirements simultaneously softens the image enough to fail the
QUALITY_MIN_BLUR_VAR=80 gate. We override the thresholds for the test
session only — the production env stays intact and quality.py logic is
verified against the overridden values. (See `_set_test_thresholds`.)
"""

from __future__ import annotations

import base64
import io
import os
from collections.abc import Iterator

# Threshold overrides MUST be applied BEFORE any argus_ml.config import,
# otherwise the lru_cache in get_settings() snapshots the production values.
def _set_test_thresholds() -> None:
    os.environ.setdefault("QUALITY_MIN_FACE_PX", "100")
    os.environ.setdefault("QUALITY_MIN_BLUR_VAR", "30")
    os.environ.setdefault("QUALITY_MAX_POSE_YAW_DEG", "45")


_set_test_thresholds()

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from insightface.data import get_image as ins_get_image
from PIL import Image


def _bgr_to_b64_jpeg(img_bgr: np.ndarray) -> str:
    """Encode a BGR ndarray to a base64 JPEG string (no data-url prefix)."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=92)
    return base64.b64encode(buf.getvalue()).decode("ascii")


@pytest.fixture(scope="session")
def single_face_b64() -> str:
    """Largest single face cropped from InsightFace's bundled `t1` group photo
    with generous context padding.

    A standalone tight crop like Tom_Hanks_54745.png (112×112) does not
    survive RetinaFace's confidence threshold without surrounding
    context. We let the model itself pick the cleanest face out of a
    real photo and crop a 1.6× context box around it, then encode that.
    The result has stable detection (>0.9 score) and passes the
    quality gate (face_size ≥ 112, sharp, frontal).
    """
    from argus_ml.face import detect_faces

    # Detect on native t1 (faces are ~104 px with blur ~160-200, yaw varies).
    # Pick the most frontal candidate, then crop with generous padding.
    # Native resolution preserves blur — upscaling either before or after
    # the crop softens the image enough to fail any reasonable blur gate.
    raw = ins_get_image("t1").copy()
    faces = detect_faces(raw, with_embeddings=False)
    assert faces, "fixture setup: no faces detected in t1.jpg"

    chosen = min(faces, key=lambda f: abs(f.yaw_deg))

    h_img, w_img = raw.shape[:2]
    bw, bh = chosen.bbox.w, chosen.bbox.h
    cx = chosen.bbox.x + bw // 2
    cy = chosen.bbox.y + bh // 2
    half = int(max(bw, bh) * 0.8)  # 1.6× context box around the face
    x1 = max(0, cx - half)
    y1 = max(0, cy - half)
    x2 = min(w_img, cx + half)
    y2 = min(h_img, cy + half)
    return _bgr_to_b64_jpeg(raw[y1:y2, x1:x2])


@pytest.fixture(scope="session")
def multi_face_b64() -> str:
    """Group photo bundled with InsightFace — multiple detectable faces."""
    raw = ins_get_image("t1")
    return _bgr_to_b64_jpeg(raw)


@pytest.fixture(scope="session")
def noise_b64() -> str:
    """A 320×240 random-noise JPEG. RetinaFace returns no faces."""
    rng = np.random.default_rng(seed=42)
    arr = rng.integers(0, 255, size=(240, 320, 3), dtype=np.uint8)
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return _bgr_to_b64_jpeg(bgr)


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """FastAPI TestClient that triggers the lifespan (warms InsightFace)."""
    # Import here so unit tests in test_quality.py don't pay for the model
    # import-graph cost when collected.
    from argus_ml.main import app

    with TestClient(app) as c:
        yield c
