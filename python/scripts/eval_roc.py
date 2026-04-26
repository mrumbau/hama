"""ROC evaluation — Tag 13.

Pulls every (poi_id, embedding) row from `face_embeddings` via the
direct Postgres URL, computes all-pairs cosine similarity, and plots
a ROC curve over genuine (same-poi) vs impostor (different-poi) pairs.

Output: docs/figures/roc.png

Caveat: the live corpus is tiny — 8 embeddings across 2 POIs in the
demo project. The figure proves the methodology; the AUC number is
not statistically meaningful at this N. Documented in EVALUATION.md
as a limitation; replaying with a 30-identity corpus is the
production-grade gate.
"""

from __future__ import annotations

import os
import sys
from itertools import combinations
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import psycopg  # noqa: E402
from sklearn.metrics import auc, roc_curve  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIGURE_PATH = REPO_ROOT / "docs" / "figures" / "roc.png"


def _load_env() -> str:
    # Read DATABASE_DIRECT_URL out of server/.env without dotenv (one-line parse).
    env_path = REPO_ROOT / "server" / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_DIRECT_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            return url
    raise SystemExit("DATABASE_DIRECT_URL not found in server/.env")


def _parse_pgvector(text: str) -> np.ndarray:
    return np.fromstring(text.strip("[]"), sep=",", dtype=np.float32)


def main() -> int:
    url = os.environ.get("DATABASE_DIRECT_URL", _load_env())
    print(f"Connecting to {url.split('@')[-1].split('?')[0]} …")

    rows: list[tuple[str, np.ndarray]] = []
    with psycopg.connect(url, sslmode="require", connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT fe.poi_id::text, fe.embedding::text
                FROM face_embeddings fe
                JOIN poi p ON p.id = fe.poi_id AND p.deleted_at IS NULL
                """
            )
            for poi_id, emb_text in cur.fetchall():
                rows.append((poi_id, _parse_pgvector(emb_text)))

    if len(rows) < 2:
        print(f"Only {len(rows)} embedding(s) in corpus — need ≥ 2 to compute pairs.")
        return 2

    poi_count = len(set(p for p, _ in rows))
    print(f"Corpus: {len(rows)} embeddings across {poi_count} POIs.")

    # All unordered pairs
    sims: list[float] = []
    labels: list[int] = []  # 1 = genuine (same poi), 0 = impostor
    for (poi_a, emb_a), (poi_b, emb_b) in combinations(rows, 2):
        # ArcFace embeddings ship pre-normalised; cosine sim = dot product.
        # Defensive renorm in case the corpus mixes norms.
        a = emb_a / (np.linalg.norm(emb_a) or 1.0)
        b = emb_b / (np.linalg.norm(emb_b) or 1.0)
        sim = float(np.dot(a, b))
        sims.append(sim)
        labels.append(1 if poi_a == poi_b else 0)

    sims_arr = np.asarray(sims)
    labels_arr = np.asarray(labels)
    n_genuine = int(labels_arr.sum())
    n_impostor = int((1 - labels_arr).sum())
    print(f"Pairs: {len(sims_arr)} total · {n_genuine} genuine · {n_impostor} impostor")
    if n_genuine == 0 or n_impostor == 0:
        print("Need at least one of each pair class for ROC. Aborting.")
        return 3

    fpr, tpr, _ = roc_curve(labels_arr, sims_arr)
    roc_auc = auc(fpr, tpr)
    print(f"AUC = {roc_auc:.4f}")

    # Genuine / impostor distributions inset
    fig, axs = plt.subplots(1, 2, figsize=(12, 5), facecolor="#0a0a0a")
    for ax in axs:
        ax.set_facecolor("#121212")
        for s in ax.spines.values():
            s.set_color("#4a4a4a")
        ax.tick_params(colors="#9f9e99")
        for label in (*ax.get_xticklabels(), *ax.get_yticklabels()):
            label.set_color("#9f9e99")

    ax_roc, ax_dist = axs

    ax_roc.plot(fpr, tpr, color="#22d3ee", linewidth=2, label=f"AUC = {roc_auc:.4f}")
    ax_roc.plot([0, 1], [0, 1], color="#4a4a4a", linewidth=1, linestyle="--")
    ax_roc.set_xlabel("False positive rate", color="#f5f4f1")
    ax_roc.set_ylabel("True positive rate", color="#f5f4f1")
    ax_roc.set_title(
        f"ROC — {len(rows)} embeddings · {poi_count} POIs",
        color="#f5f4f1",
        fontfamily="monospace",
    )
    ax_roc.legend(facecolor="#0a0a0a", labelcolor="#f5f4f1", edgecolor="#4a4a4a")
    ax_roc.set_xlim(0, 1)
    ax_roc.set_ylim(0, 1.02)
    ax_roc.grid(color="#2d2d2d", linestyle=":", linewidth=0.5)

    # Distribution histogram
    bins = np.linspace(-0.2, 1.0, 25)
    ax_dist.hist(
        sims_arr[labels_arr == 1],
        bins=bins,
        alpha=0.75,
        color="#22d3ee",
        label=f"genuine (n={n_genuine})",
    )
    ax_dist.hist(
        sims_arr[labels_arr == 0],
        bins=bins,
        alpha=0.75,
        color="#e61919",
        label=f"impostor (n={n_impostor})",
    )
    ax_dist.set_xlabel("Cosine similarity", color="#f5f4f1")
    ax_dist.set_ylabel("Pair count", color="#f5f4f1")
    ax_dist.set_title("Score distribution", color="#f5f4f1", fontfamily="monospace")
    ax_dist.legend(facecolor="#0a0a0a", labelcolor="#f5f4f1", edgecolor="#4a4a4a")
    ax_dist.grid(color="#2d2d2d", linestyle=":", linewidth=0.5)

    fig.suptitle(
        "Argus Layer 1 — pgvector kNN ROC",
        color="#f5f4f1",
        fontfamily="monospace",
        fontsize=14,
        y=0.98,
    )
    fig.tight_layout()
    FIGURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURE_PATH, dpi=150, facecolor="#0a0a0a")
    print(f"Wrote {FIGURE_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
