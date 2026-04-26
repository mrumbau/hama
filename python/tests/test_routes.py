"""Integration tests for /detect /embed /quality.

These load the InsightFace model (slow first-run, ~5–10 s for the model
weights download + ONNX graph compile). Pytest's session-scoped client
fixture warms it once.

Plan §13 Tag 4 gate: `curl :8001/embed` with a demo face → 512-D vector.
The corresponding test is `test_embed_returns_512d_vector`.
"""

from __future__ import annotations

import math


def test_health_returns_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "service": "argus-ml", "day": 4}


def test_detect_finds_at_least_one_face(client, single_face_b64):
    r = client.post("/detect", json={"image_b64": single_face_b64})
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["faces"]) >= 1
    f = data["faces"][0]
    assert {"x", "y", "w", "h"} <= f["bbox"].keys()
    assert f["det_score"] > 0.5


def test_detect_finds_multiple_faces(client, multi_face_b64):
    r = client.post("/detect", json={"image_b64": multi_face_b64})
    assert r.status_code == 200
    data = r.json()
    assert len(data["faces"]) >= 2


def test_detect_returns_empty_on_noise(client, noise_b64):
    r = client.post("/detect", json={"image_b64": noise_b64})
    assert r.status_code == 200
    assert r.json()["faces"] == []


def test_detect_default_omits_embeddings(client, single_face_b64):
    """Tag 7 multi-camera matrix wants lighter payloads when only bboxes are needed."""
    r = client.post("/detect", json={"image_b64": single_face_b64})
    assert r.status_code == 200
    for f in r.json()["faces"]:
        assert f["embedding"] is None


def test_detect_with_embeddings_inlines_512d_per_face(client, multi_face_b64):
    """Tag 6 Patrol Mode: one ML round-trip → all faces + embeddings."""
    r = client.post("/detect", json={"image_b64": multi_face_b64, "with_embeddings": True})
    assert r.status_code == 200
    faces = r.json()["faces"]
    assert len(faces) >= 2
    for f in faces:
        assert f["embedding"] is not None
        assert len(f["embedding"]) == 512


def test_embed_returns_512d_vector(client, single_face_b64):
    """Plan §13 Tag 4 gate."""
    r = client.post("/embed", json={"image_b64": single_face_b64})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["embedding_dim"] == 512
    emb = data["embedding"]
    assert isinstance(emb, list)
    assert len(emb) == 512
    assert all(isinstance(x, float) for x in emb)
    # ArcFace produces L2-normalised embeddings via normed_embedding;
    # tolerate both: norm is either ~1.0 or some larger arbitrary value.
    norm = math.sqrt(sum(x * x for x in emb))
    assert norm > 0.5


def test_embed_is_deterministic(client, single_face_b64):
    """Plan §13 Tag 4: 'pytest für Embedding-Determinismus'.

    Same image, same model → byte-identical (or numerically identical
    within float32 tolerance) embedding. Cosine similarity must be
    1.0 minus epsilon. Without this the pgvector kNN built on Tag 6 is
    chasing a moving target.
    """
    r1 = client.post("/embed", json={"image_b64": single_face_b64})
    r2 = client.post("/embed", json={"image_b64": single_face_b64})
    assert r1.status_code == 200
    assert r2.status_code == 200
    e1 = r1.json()["embedding"]
    e2 = r2.json()["embedding"]
    assert len(e1) == len(e2) == 512
    # Cosine similarity
    dot = sum(a * b for a, b in zip(e1, e2))
    n1 = math.sqrt(sum(a * a for a in e1))
    n2 = math.sqrt(sum(b * b for b in e2))
    cosine = dot / (n1 * n2)
    assert cosine > 0.99999, f"non-deterministic embedding (cosine={cosine})"


def test_embed_returns_422_on_no_face(client, noise_b64):
    r = client.post("/embed", json={"image_b64": noise_b64})
    assert r.status_code == 422
    assert r.json()["detail"]["error"] == "no_face"


def test_quality_passes_for_single_clear_face(client, single_face_b64):
    r = client.post("/quality", json={"image_b64": single_face_b64})
    assert r.status_code == 200
    data = r.json()
    # The Tom Hanks crop is upscaled to 224×224 — should pass face-size,
    # is sharp (JPEG 92), and is frontal. The gate is expected to pass.
    assert data["passes"] is True, f"unexpected reasons: {data['reasons']}"
    assert data["face"] is not None


def test_quality_rejects_multiple_faces(client, multi_face_b64):
    r = client.post("/quality", json={"image_b64": multi_face_b64})
    assert r.status_code == 200
    data = r.json()
    assert data["passes"] is False
    assert data["reasons"] == ["multiple_faces"]


def test_quality_rejects_no_face(client, noise_b64):
    r = client.post("/quality", json={"image_b64": noise_b64})
    assert r.status_code == 200
    data = r.json()
    assert data["passes"] is False
    assert data["reasons"] == ["no_face"]


def test_invalid_base64_returns_422(client):
    r = client.post("/embed", json={"image_b64": "????" * 16})
    assert r.status_code == 422


def test_empty_image_returns_422(client):
    r = client.post("/embed", json={"image_b64": "                                  "})
    # Either pydantic min_length blocks, or our decoder reports empty_image.
    assert r.status_code == 422
