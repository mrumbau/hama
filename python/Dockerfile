# Day 1 stub. Tag 4 fills in the multi-stage build with InsightFace model warmup.
# Pin to linux/amd64 for ONNX Runtime + InsightFace reproducibility on Apple Silicon hosts.

FROM --platform=linux/amd64 python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip setuptools wheel \
  && pip install -e .

COPY argus_ml ./argus_ml

EXPOSE 8001

CMD ["uvicorn", "argus_ml.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
