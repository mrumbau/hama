"""Patrol tracking speedup — Tag 13.

Replays a synthetic frame sequence through the local ML service twice:

    Tag-6 path: POST /detect with_embeddings=true on every frame —
                ArcFace runs for every detected face, every frame.
    Tag-7 path: POST /recognize-tracked with the same tracker_state_key —
                ByteTrack assigns stable ids; ArcFace runs only on new
                tracks or stale (>2s) cached embeddings, the rest are
                recycled from Redis.

Output:
  docs/figures/tracking_speedup.png — bar chart of total ArcFace calls
  + total wall-clock per path.

Methodology: starts from the InsightFace bundled t1.jpg group photo
(6 faces), generates N synthetic perturbed frames by translating the
image by 1-3 pixels per frame (mimics small camera/subject motion),
then replays both paths against a fresh tracker_state_key. The
expected speedup is 5-8× per ADR-3.
"""

from __future__ import annotations

import base64
import io
import os
import sys
import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import requests  # noqa: E402  — pulled in transitively; if missing, swap to urllib

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIGURE_PATH = REPO_ROOT / "docs" / "figures" / "tracking_speedup.png"

ML_BASE_URL = os.environ.get("ML_BASE_URL", "http://127.0.0.1:8001")
N_FRAMES = int(os.environ.get("EVAL_FRAMES", 30))


def _build_frames() -> list[str]:
    """Generate N base64 JPEG frames by translating t1.jpg slightly."""
    from insightface.data import get_image as ins_get_image  # type: ignore
    import cv2  # type: ignore

    base = ins_get_image("t1")
    h, w = base.shape[:2]
    frames: list[str] = []
    rng = np.random.default_rng(13)
    for i in range(N_FRAMES):
        dx, dy = rng.integers(-3, 4, size=2)
        m = np.float32([[1, 0, dx], [0, 1, dy]])
        shifted = cv2.warpAffine(base, m, (w, h), borderMode=cv2.BORDER_REPLICATE)
        ok, buf = cv2.imencode(".jpg", shifted, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        if not ok:
            raise RuntimeError("cv2.imencode failed")
        frames.append(base64.b64encode(buf.tobytes()).decode("ascii"))
    return frames


def _detect_path(frames: list[str]) -> tuple[int, float]:
    """Tag-6 path: every frame runs the full pipeline (ArcFace per face)."""
    total_embeds = 0
    t0 = time.perf_counter()
    for b64 in frames:
        r = requests.post(
            f"{ML_BASE_URL}/detect",
            json={"image_b64": b64, "with_embeddings": True},
            timeout=30,
        )
        r.raise_for_status()
        d = r.json()
        # Every face that comes back carries an embedding (a fresh ArcFace inference).
        total_embeds += sum(1 for f in d["faces"] if f.get("embedding") is not None)
    return total_embeds, time.perf_counter() - t0


def _tracked_path(frames: list[str]) -> tuple[int, int, float]:
    """Tag-7 path: tracker keyed by `eval-track`. Returns (fresh, recycled, wall)."""
    fresh_total = 0
    recycled_total = 0
    state_key = f"eval-track-{int(time.time())}"
    t0 = time.perf_counter()
    for b64 in frames:
        r = requests.post(
            f"{ML_BASE_URL}/recognize-tracked",
            json={"image_b64": b64, "tracker_state_key": state_key},
            timeout=30,
        )
        r.raise_for_status()
        m = r.json()["metrics"]
        fresh_total += m.get("embeds_fresh", 0)
        recycled_total += m.get("embeds_recycled", 0)
    return fresh_total, recycled_total, time.perf_counter() - t0


def main() -> int:
    print(f"Building {N_FRAMES} synthetic frames from t1.jpg …")
    frames = _build_frames()
    print(f"Built {len(frames)} frames (~{sum(len(f) for f in frames) / 1024:.0f} KB total b64)")

    # Sanity ping
    health = requests.get(f"{ML_BASE_URL}/health", timeout=5)
    health.raise_for_status()
    print(f"ML reachable: {health.json()}")

    print("Replaying Tag-6 path (/detect with_embeddings=true) …")
    detect_embeds, detect_wall = _detect_path(frames)
    print(f"  ArcFace inferences: {detect_embeds}  ·  wall: {detect_wall:.2f}s")

    print("Replaying Tag-7 path (/recognize-tracked) …")
    fresh, recycled, tracked_wall = _tracked_path(frames)
    total_tracked = fresh + recycled
    print(
        f"  fresh embeddings: {fresh}  ·  recycled: {recycled}  ·  total faces tracked: {total_tracked}"
    )
    print(f"  wall: {tracked_wall:.2f}s")

    if fresh == 0:
        print("Zero fresh embeddings — something's wrong with the tracker. Aborting.")
        return 3

    speedup_calls = detect_embeds / max(fresh, 1)
    speedup_wall = detect_wall / max(tracked_wall, 0.001)
    print(f"\nSpeedup (ArcFace calls): {speedup_calls:.2f}×")
    print(f"Speedup (wall-clock): {speedup_wall:.2f}×")

    # ── Plot ──
    fig, (ax_calls, ax_wall) = plt.subplots(1, 2, figsize=(13, 5.5), facecolor="#0a0a0a")
    for ax in (ax_calls, ax_wall):
        ax.set_facecolor("#121212")
        for s in ax.spines.values():
            s.set_color("#4a4a4a")
        ax.tick_params(colors="#9f9e99")
        for label in (*ax.get_xticklabels(), *ax.get_yticklabels()):
            label.set_color("#9f9e99")

    # Calls bar chart — Tag-7 split into fresh vs recycled
    ax_calls.bar(["Tag 6\n(no tracking)"], [detect_embeds], color="#e61919", width=0.5)
    ax_calls.bar(["Tag 7\n(track-cached)"], [fresh], color="#22d3ee", width=0.5)
    ax_calls.bar(
        ["Tag 7\n(track-cached)"],
        [recycled],
        bottom=[fresh],
        color="#67e8f9",
        width=0.5,
        alpha=0.5,
        label="recycled (no inference)",
    )
    for x, label, value in [
        (0, f"{detect_embeds}\nArcFace", detect_embeds),
        (1, f"{fresh}\nfresh", fresh),
    ]:
        ax_calls.text(
            x,
            value / 2,
            label,
            ha="center",
            color="#f5f4f1",
            fontfamily="monospace",
            fontsize=11,
        )
    ax_calls.text(
        1,
        fresh + recycled / 2,
        f"{recycled}\nrecycled",
        ha="center",
        color="#0a0a0a",
        fontfamily="monospace",
        fontsize=10,
    )
    ax_calls.set_ylabel("Per-frame face passes (cumulative)", color="#f5f4f1")
    ax_calls.set_title(
        f"ArcFace inference count — {N_FRAMES} frames\n"
        f"speedup: {speedup_calls:.2f}× fewer inferences",
        color="#f5f4f1",
        fontfamily="monospace",
        fontsize=11,
    )
    ax_calls.grid(color="#2d2d2d", linestyle=":", linewidth=0.5, axis="y")

    # Wall-clock bar chart
    bars = ax_wall.bar(
        ["Tag 6\n(no tracking)", "Tag 7\n(track-cached)"],
        [detect_wall, tracked_wall],
        color=["#e61919", "#22d3ee"],
        width=0.5,
    )
    for bar, value in zip(bars, [detect_wall, tracked_wall]):
        ax_wall.text(
            bar.get_x() + bar.get_width() / 2,
            value + max(detect_wall, tracked_wall) * 0.02,
            f"{value:.2f}s",
            ha="center",
            color="#f5f4f1",
            fontfamily="monospace",
            fontsize=11,
        )
    ax_wall.set_ylabel("Wall-clock (s)", color="#f5f4f1")
    ax_wall.set_title(
        f"Total wall-clock — speedup: {speedup_wall:.2f}×",
        color="#f5f4f1",
        fontfamily="monospace",
        fontsize=11,
    )
    ax_wall.grid(color="#2d2d2d", linestyle=":", linewidth=0.5, axis="y")

    fig.suptitle(
        f"Argus Patrol Mode — Tag 7 ByteTrack speedup over Tag 6 baseline ({N_FRAMES} frames, t1 fixture)",
        color="#f5f4f1",
        fontfamily="monospace",
        fontsize=13,
        y=0.98,
    )
    fig.tight_layout()
    FIGURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURE_PATH, dpi=150, facecolor="#0a0a0a")
    print(f"\nWrote {FIGURE_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
