"""FastAPI bootstrap. Day 1 stub — Tag 4 wires up /detect /embed /quality."""

from fastapi import FastAPI

app = FastAPI(title="argus-ml", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "argus-ml", "day": 1}
