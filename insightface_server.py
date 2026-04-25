import base64
import io
from typing import Any, List, Optional

import cv2
import numpy as np
import requests
from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image
from insightface.app import FaceAnalysis

app = FastAPI(title="InsightFace Compare Server")

app_model = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
app_model.prepare(ctx_id=0, det_size=(640, 640))


class CandidateItem(BaseModel):
    id: Optional[str] = None
    url: str


class CompareRequest(BaseModel):
    refImage: str
    candidates: List[CandidateItem]


def decode_data_url(data_url: str) -> np.ndarray:
    if data_url.startswith("data:"):
      _, encoded = data_url.split(",", 1)
      raw = base64.b64decode(encoded)
    else:
      raw = base64.b64decode(data_url)

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.array(img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def load_image_from_any(value: str) -> np.ndarray:
    if value.startswith("data:"):
        return decode_data_url(value)

    if value.startswith("http://") or value.startswith("https://"):
        r = requests.get(value, timeout=45, headers={
            "User-Agent": "Mozilla/5.0"
        })
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        arr = np.array(img)
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

    return decode_data_url(value)


def face_area(face: Any) -> float:
    x1, y1, x2, y2 = face.bbox.astype(int)
    return max(0, x2 - x1) * max(0, y2 - y1)


def blur_score(img: np.ndarray) -> float:
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def norm100(sim: float) -> float:
    return max(0.0, min(100.0, ((sim + 1.0) / 2.0) * 100.0))


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/compare")
def compare(req: CompareRequest):
    ref_img = load_image_from_any(req.refImage)
    ref_faces = app_model.get(ref_img)

    if not ref_faces:
        return {"results": []}

    ref_face = max(ref_faces, key=face_area)
    ref_emb = ref_face.normed_embedding

    results = []

    for cand in req.candidates:
        try:
            cand_img = load_image_from_any(cand.url)
            faces = app_model.get(cand_img)

            best = 0.0

            for f in faces:
                x1, y1, x2, y2 = f.bbox.astype(int)
                if (x2 - x1) < 60 or (y2 - y1) < 60:
                    continue

                crop = cand_img[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
                if crop.size == 0:
                    continue

                if blur_score(crop) < 30:
                    continue

                sim = cosine_sim(ref_emb, f.normed_embedding)
                best = max(best, norm100(sim))

            results.append({
                "id": cand.id,
                "url": cand.url,
                "match": round(best, 2),
            })
        except Exception:
            results.append({
                "id": cand.id,
                "url": cand.url,
                "match": 0.0,
            })

    return {"results": results}
