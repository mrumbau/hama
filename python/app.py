from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, model_validator
from typing import Optional, Any
import base64
import numpy as np
import cv2

from insightface.app import FaceAnalysis

app = FastAPI()

face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))

MIN_FACE_SIZE = 60
MIN_DET_SCORE = 0.45


def _to_bytes_from_dataurl_or_base64(s: str) -> bytes:
    if not s:
        raise ValueError("Empty image string")

    s = s.strip()

    if "base64," in s and s.startswith("data:"):
        b64 = s.split("base64,", 1)[1]
        return base64.b64decode(b64)

    return base64.b64decode(s)


def _dataurl_or_b64_to_bgr(img_str: str) -> np.ndarray:
    raw = _to_bytes_from_dataurl_or_base64(img_str)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image")
    return img


def _valid_face(f) -> bool:
    x1, y1, x2, y2 = f.bbox
    w = float(x2 - x1)
    h = float(y2 - y1)
    det_score = float(getattr(f, "det_score", 1.0))
    return w >= MIN_FACE_SIZE and h >= MIN_FACE_SIZE and det_score >= MIN_DET_SCORE


def _get_best_embedding(img_bgr: np.ndarray) -> np.ndarray:
    faces = face_app.get(img_bgr)
    if not faces:
        raise ValueError("No face detected")

    faces = [f for f in faces if _valid_face(f)]
    if not faces:
        raise ValueError("No valid face detected")

    best = max(
        faces,
        key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
    )

    emb = best.embedding
    if emb is None:
        raise ValueError("No embedding")

    return emb.astype(np.float32)


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-9)
    b = b / (np.linalg.norm(b) + 1e-9)
    return float(np.dot(a, b))


def _sim_to_percent(sim: float) -> float:
    x = (sim + 1.0) / 2.0
    x = max(0.0, min(1.0, x))
    return x * 100.0


class CompareRequest(BaseModel):
    refBase64: Optional[str] = None
    candBase64: Optional[str] = None

    imageBase64: Optional[str] = None
    candidateBase64: Optional[str] = None
    referenceBase64: Optional[str] = None

    reference: Optional[str] = None
    candidate: Optional[str] = None

    sourceBase64: Optional[str] = None
    targetBase64: Optional[str] = None

    ref_base64: Optional[str] = None
    cand_base64: Optional[str] = None
    reference_base64: Optional[str] = None
    candidate_base64: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, data: Any):
        if not isinstance(data, dict):
            return data

        ref = (
            data.get("refBase64")
            or data.get("referenceBase64")
            or data.get("reference_base64")
            or data.get("ref_base64")
            or data.get("sourceBase64")
            or data.get("reference")
        )

        cand = (
            data.get("candBase64")
            or data.get("candidateBase64")
            or data.get("candidate_base64")
            or data.get("cand_base64")
            or data.get("targetBase64")
            or data.get("candidate")
        )

        img = data.get("imageBase64")
        if ref is None and img and cand:
            ref = img
        if cand is None and img and ref:
            cand = img

        data["refBase64"] = ref
        data["candBase64"] = cand
        return data


class CompareResponse(BaseModel):
    score: float
    similarity: float


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/compare", response_model=CompareResponse)
def compare(req: CompareRequest):
    if not req.refBase64 or not req.candBase64:
        raise HTTPException(status_code=422, detail="Missing refBase64/candBase64")

    try:
        ref_img = _dataurl_or_b64_to_bgr(req.refBase64)
        cand_img = _dataurl_or_b64_to_bgr(req.candBase64)

        e1 = _get_best_embedding(ref_img)
        e2 = _get_best_embedding(cand_img)

        sim = _cosine_sim(e1, e2)
        score = _sim_to_percent(sim)

        return {"score": score, "similarity": sim}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))