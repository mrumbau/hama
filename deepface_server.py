import os
import uuid
import time
import tempfile
import urllib.request
import numpy as np
import faiss
from flask import Flask, request, jsonify
from deepface import DeepFace

app = Flask(__name__)

# -------------------------
# Settings (DeepFace + FAISS)
# -------------------------
# ArcFace is one of the best models (ResNet structure)
MODEL_NAME = "ArcFace"
# RetinaFace does excellent 5-point alignment and face detection
DETECTOR = "retinaface"

TOP_K = 6
MIN_CONF = 75
MIN_SIM = 0.50  # 50% Threshold for ArcFace

print(f"Server initializing... Model: {MODEL_NAME}, Detector: {DETECTOR}")

# -------------------------
# Helpers
# -------------------------
def l2_normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm

def sim_to_conf(sim: float) -> int:
    # Map cosine similarity (-1 to 1) to percentage (0 to 100)
    return int(max(0, min(100, (sim + 1) * 50)))

def download_image(url):
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://www.google.com/"
    }
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=12) as response:
                content = response.read()
            temp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}.jpg")
            with open(temp_path, "wb") as f:
                f.write(content)
            return temp_path
        except Exception as e:
            time.sleep(1)
    return None

# -------------------------
# Extract Embedding via DeepFace
# -------------------------
def get_embedding(img_path):
    try:
        # returns a list of face objects. Grab the first one explicitly.
        reps = DeepFace.represent(
            img_path=img_path,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR,
            enforce_detection=False # return even if confidence is low, prevents crashing
        )
        if len(reps) > 0:
            # We take the embeddings and L2 Normalize them so that FAISS Inner Product = Cosine Sim
            emb = np.array(reps[0]["embedding"], dtype=np.float32)
            return l2_normalize(emb)
        return None
    except Exception as e:
        print(f"DeepFace extracting error: {e}")
        return None

# -------------------------
# Compare API API endpoint using FAISS
# -------------------------
@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "active",
        "service": "Sentinel Face Recognition API (DeepFace + FAISS)",
        "model": MODEL_NAME,
        "detector": DETECTOR
    }), 200

@app.route("/compare", methods=["POST"])
def compare():
    data = request.json or {}

    import base64, uuid, os

    ref_base64 = data.get("refBase64")
    candidates = data.get("candidates", [])

    if not ref_base64 or not candidates:
        return jsonify({"error": "Missing refBase64 or candidates"}), 400

    # base64 → فایل
    os.makedirs("tmp", exist_ok=True)
    ref_path = os.path.join("tmp", f"{uuid.uuid4().hex}.jpg")

    with open(ref_path, "wb") as f:
        f.write(base64.b64decode(ref_base64))

    # embedding
    ref_emb = get_embedding(ref_path)
    if ref_emb is None:
        return jsonify({"error": "No face found in reference image"}), 400

    # لێرە بەردەوام بە کۆدەکەی خۆت بۆ candidates

       # FAISS expects a 2D float32 array
    ref_emb_reshaped = np.array([ref_emb], dtype=np.float32)

    # 2. Download & Embed Candidates
    cand_embs = []
    valid_urls = []
    results = []

    for url in candidates:
        cand_path = download_image(url)
        if not cand_path:
            results.append({"url": url, "match": False, "score": 0})
            continue

        cand_emb = get_embedding(cand_path)
        if cand_emb is None:
            results.append({"url": url, "match": False, "score": 0})
            continue

        cand_embs.append(cand_emb)
        valid_urls.append(url)

    if not cand_embs:
        return jsonify({"count": 0, "results": results})

    # 3. Build FAISS Index and Search
    cand_matrix = np.array(cand_embs, dtype=np.float32)
    d = cand_matrix.shape[1] # Dimension (512 for ArcFace)

    # IndexFlatIP computes the inner product. 
    # Since our vectors are L2-normalized, IP is exactly Cosine Similarity.
    index = faiss.IndexFlatIP(d)
    index.add(cand_matrix)

    # Search for the top K similar faces
    k = min(TOP_K, len(valid_urls))
    similarities, indices = index.search(ref_emb_reshaped, k)

    # 4. Process Results
    for i in range(k):
        sim = float(similarities[0][i])
        idx = int(indices[0][i])
        conf = sim_to_conf(sim)

        if conf >= MIN_CONF and sim >= MIN_SIM:
            results.append({
                "url": valid_urls[idx],
                "similarity": round(sim, 4),
                "confidence": conf
            })

    # Sort primarily by confidence (descending)
    results.sort(key=lambda x: x.get("confidence", 0), reverse=True)

    return jsonify({"count": len(results), "results": results})

if __name__ == "__main__":
    # Runs locally on port 5002
    app.run(host="0.0.0.0", port=5002)