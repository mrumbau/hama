# syntax=docker/dockerfile:1.7
# Project Chaw ML service — Render Standard (2GB RAM).
#
# Single-stage on python:3.11-slim. Most Python deps ship pre-compiled
# wheels for linux/amd64 (numpy, opencv-python-headless, onnxruntime);
# insightface itself needs build-essential for its Cython extension,
# which we purge in the same layer to keep the image lean. The
# buffalo_l InsightFace pack is downloaded at build time and baked
# into the image so cold-start does not pull ~280MB on every Render boot.
#
# Pin to linux/amd64 for ONNX Runtime + InsightFace reproducibility on
# Apple Silicon hosts.

FROM --platform=linux/amd64 python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    INSIGHTFACE_MODEL_PACK=buffalo_l

# Runtime system libs:
#   libgomp1 — onnxruntime's OpenMP runtime
#   curl     — HEALTHCHECK probe
# Build-time deps (purged after pip install):
#   build-essential — insightface ships a Cython extension
#                     (face3d.mesh.cython.mesh_core_cython) with no
#                     pre-built wheel for linux/amd64 + py3.11, so pip
#                     falls back to compiling from source.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        libgomp1 curl build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so the layer caches across code changes.
# pyproject.toml + pinned numpy<2 / supervision==0.22.0 from D-018
# keep us inside the insightface 0.7.3 ABI window.
COPY pyproject.toml ./
RUN pip install --upgrade pip setuptools wheel \
 && pip install -e . \
 && apt-get purge -y --auto-remove build-essential \
 && rm -rf /root/.cache/pip

# Copy the application source AFTER deps so re-builds don't reinstall
# pip every time only argus_ml/*.py changes.
COPY argus_ml ./argus_ml

# Bake the buffalo_l pack into the image at build time. InsightFace
# downloads under $HOME/.insightface/models/ — we trigger the prepare()
# call once and let it cache. The download is ~280MB (R50-ArcFace +
# RetinaFace + landmark/genderage nets) and goes through the InsightFace
# mirror, so build-time network access is required (Render build runners
# always have it). Cold-start at runtime skips the download entirely.
RUN python -c "from insightface.app import FaceAnalysis; \
    FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']) \
        .prepare(ctx_id=0, det_size=(640, 640))" \
 && ls -la /root/.insightface/models/buffalo_l/

# Render Standard ships single-vCPU + 2GB RAM. One uvicorn worker keeps
# the resident set at ~1.2–1.5GB with buffalo_l loaded; two workers
# would double the InsightFace memory and run out of headroom while
# only trading off blocking-CPU time, not gaining real concurrency.
ENV ML_HOST=0.0.0.0 \
    ML_PORT=8001 \
    ML_WORKERS=1

EXPOSE 8001

# Local-docker healthcheck. Render fires its own probe via the public
# URL; this is purely for `docker run` smoke-testing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fs http://localhost:${ML_PORT}/health || exit 1

# Shell-form so $PORT (Render-injected) is interpolated; falls back to
# $ML_PORT for local docker runs.
CMD uvicorn argus_ml.main:app \
    --host "${ML_HOST}" \
    --port "${PORT:-${ML_PORT}}" \
    --workers "${ML_WORKERS}"
