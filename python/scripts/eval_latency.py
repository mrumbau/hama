"""Sniper latency breakdown — Tag 13.

Queries `fusion_layers` for the past N most-recent reports, computes
per-layer mean+median latency, and emits a stacked bar chart that
visualises both the parallel-fanout total (max of layers) and the
hypothetical sequential variant (sum of layers).

The defence headline: serial would be ~max(layer_i) summed up;
parallel-fanout is ~max(layer_i) — the speedup factor is the
sequential/parallel ratio per report.

Output: docs/figures/sniper_latency.png
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import psycopg  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIGURE_PATH = REPO_ROOT / "docs" / "figures" / "sniper_latency.png"

LAYERS = ["identity", "web_presence", "geographic", "authenticity"]
LAYER_COLORS = {
    "identity": "#22d3ee",
    "web_presence": "#f5b820",
    "geographic": "#67e8f9",
    "authenticity": "#e61919",
}


def _load_env() -> str:
    env_path = REPO_ROOT / "server" / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_DIRECT_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_DIRECT_URL not in server/.env")


def main() -> int:
    url = os.environ.get("DATABASE_DIRECT_URL", _load_env())
    n_reports = int(os.environ.get("EVAL_N_REPORTS", 10))

    rows: list[tuple[str, str, int | None]] = []
    with psycopg.connect(url, sslmode="require", connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.id::text, l.layer::text, l.latency_ms
                FROM fusion_reports r
                JOIN fusion_layers l ON l.report_id = r.id
                WHERE r.created_at > now() - interval '30 days'
                ORDER BY r.created_at DESC
                """
            )
            rows = cur.fetchall()

    # Group by report
    by_report: dict[str, dict[str, int]] = {}
    for report_id, layer, latency in rows:
        if latency is None:
            continue
        by_report.setdefault(report_id, {})[layer] = latency

    # Keep only reports where all 4 layers have terminal latency
    full_reports = [r for r, ls in by_report.items() if len(ls) == 4]
    full_reports = full_reports[:n_reports]
    if not full_reports:
        print("No fully-completed reports found. Run a Sniper query first.")
        return 2

    print(f"Found {len(full_reports)} fully-completed reports (capped at {n_reports}).")

    # Build matrix [n_reports x 4]
    matrix = np.zeros((len(full_reports), 4), dtype=int)
    for i, report_id in enumerate(full_reports):
        for j, layer in enumerate(LAYERS):
            matrix[i, j] = by_report[report_id].get(layer, 0)

    parallel_total = matrix.max(axis=1)
    sequential_total = matrix.sum(axis=1)
    speedup = sequential_total / np.where(parallel_total == 0, 1, parallel_total)

    print(f"Per-report parallel total (ms): {parallel_total.tolist()}")
    print(f"Per-report sequential total (ms): {sequential_total.tolist()}")
    print(f"Per-report speedup factors: {[f'{s:.2f}x' for s in speedup]}")
    print(f"Mean speedup: {speedup.mean():.2f}×")

    # ── Plot ──
    fig, (ax_stack, ax_compare) = plt.subplots(
        1, 2, figsize=(14, 5.5), facecolor="#0a0a0a", gridspec_kw={"width_ratios": [3, 2]}
    )
    for ax in (ax_stack, ax_compare):
        ax.set_facecolor("#121212")
        for s in ax.spines.values():
            s.set_color("#4a4a4a")
        ax.tick_params(colors="#9f9e99")
        for label in (*ax.get_xticklabels(), *ax.get_yticklabels()):
            label.set_color("#9f9e99")

    # Stacked bar: per-report breakdown
    x = np.arange(len(full_reports))
    bottom = np.zeros(len(full_reports))
    for j, layer in enumerate(LAYERS):
        ax_stack.bar(
            x, matrix[:, j], bottom=bottom, color=LAYER_COLORS[layer], label=layer, width=0.6
        )
        bottom += matrix[:, j]

    # Mark parallel-total as a horizontal stub on top of each bar
    for i, total in enumerate(parallel_total):
        ax_stack.hlines(total, i - 0.4, i + 0.4, color="#f5f4f1", linewidth=2)

    ax_stack.set_xlabel("Report (recent → old)", color="#f5f4f1")
    ax_stack.set_ylabel("Latency (ms)", color="#f5f4f1")
    ax_stack.set_title(
        f"Sniper layer latency — last {len(full_reports)} reports\n"
        f"(stacked = sequential; white tick = actual parallel total)",
        color="#f5f4f1",
        fontfamily="monospace",
        fontsize=11,
    )
    ax_stack.legend(facecolor="#0a0a0a", labelcolor="#f5f4f1", edgecolor="#4a4a4a", loc="upper right")
    ax_stack.set_xticks(x)
    ax_stack.set_xticklabels([f"R{i+1}" for i in range(len(full_reports))])
    ax_stack.grid(color="#2d2d2d", linestyle=":", linewidth=0.5, axis="y")

    # Comparison bar: mean parallel vs mean sequential
    means_parallel = parallel_total.mean()
    means_sequential = sequential_total.mean()
    bars = ax_compare.bar(
        ["parallel\n(actual)", "sequential\n(hypothetical)"],
        [means_parallel, means_sequential],
        color=["#22d3ee", "#e61919"],
        width=0.5,
    )
    for bar, value in zip(bars, [means_parallel, means_sequential]):
        ax_compare.text(
            bar.get_x() + bar.get_width() / 2,
            value + 50,
            f"{int(value)} ms",
            ha="center",
            color="#f5f4f1",
            fontfamily="monospace",
            fontsize=11,
        )
    ax_compare.set_ylabel("Mean latency (ms)", color="#f5f4f1")
    ax_compare.set_title(
        f"Mean speedup: {speedup.mean():.2f}×",
        color="#f5f4f1",
        fontfamily="monospace",
        fontsize=11,
    )
    ax_compare.grid(color="#2d2d2d", linestyle=":", linewidth=0.5, axis="y")

    fig.suptitle(
        "Argus Sniper Mode — parallel fan-out latency benchmark",
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
