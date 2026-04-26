"""FastAPI bootstrap.

Lifespan loads the InsightFace model once at startup so the first
request after server-ready is hot. Without warmup the first /embed
takes ~5–10 s (model parse + GPU/CPU graph compile).
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from loguru import logger

from .config import get_settings
from .face import get_face_app
from .routes import router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    s = get_settings()
    logger.info(
        f"argus-ml starting · pack={s.INSIGHTFACE_MODEL_PACK} det_size={s.INSIGHTFACE_DET_SIZE}"
    )
    get_face_app()  # warm the singleton; first request becomes hot
    logger.info("argus-ml ready")
    yield
    logger.info("argus-ml shutting down")


app = FastAPI(title="argus-ml", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "argus-ml", "day": 4}


app.include_router(router)
