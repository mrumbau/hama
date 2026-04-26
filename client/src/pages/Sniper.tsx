import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useLocation } from "wouter";

import { ErrorBlock } from "../components/ErrorBlock";
import { sniperApi, type SniperCostSummary } from "../lib/sniper";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/cn";
import styles from "./Sniper.module.css";

interface ReportRow {
  id: string;
  status: "processing" | "complete" | "failed";
  query_storage_path: string;
  created_at: string;
  completed_at: string | null;
}

const PAGE_LIMIT = 25;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function Sniper() {
  const [, setLocation] = useLocation();
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [pageError, setPageError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [costSummary, setCostSummary] = useState<SniperCostSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Cost-guard summary (Tag 10 budget widget) ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const summary = await sniperApi.costSummary();
        if (!cancelled) setCostSummary(summary);
      } catch {
        // Non-fatal — budget widget hides if the call fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uploading]);

  // ── Past reports list ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("fusion_reports")
        .select("id, status, query_storage_path, created_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(PAGE_LIMIT);
      if (cancelled) return;
      if (error) {
        setPageError(error);
        return;
      }
      setReports(data as ReportRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Upload + redirect ────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      setLastFile(file);
      setUploading(true);
      setUploadError(null);
      try {
        const result = await sniperApi.run(file);
        setLocation(`/sniper/${result.report_id}`);
      } catch (err) {
        setUploadError(err);
        setUploading(false);
      }
    },
    [setLocation],
  );

  const retryUpload = useCallback(() => {
    if (lastFile) void handleFile(lastFile);
  }, [lastFile, handleFile]);

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  function onPicked(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = "";
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SNIPER / FUSION</span>
          <h1 className={styles.title}>Sniper Mode</h1>
          <p className={styles.subtitle}>
            One face photo in — four independent OSINT layers out, in parallel.
          </p>
        </div>
        {costSummary && <BudgetWidget summary={costSummary} />}
      </header>

      {reports !== null && reports.length === 0 && costSummary && (
        <FirstRunLayerIntro summary={costSummary} />
      )}

      {/* ── Upload zone ─────────────────────────────────────────────────── */}
      <section className={styles.uploadSection}>
        <span className={styles.sectionTitle}>NEW QUERY</span>
        <label
          className={cn(
            styles.dropzone,
            dragging && styles.dropzoneDragging,
            uploading && styles.dropzoneBusy,
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            className={styles.fileInputHidden}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPicked}
            disabled={uploading}
          />
          <div className={styles.dropzoneText}>
            {uploading ? (
              <>
                <span className={styles.spinnerDot} aria-hidden="true" />
                running 4-layer fanout…
              </>
            ) : (
              "[ drop face photo here or click ]"
            )}
            <span className={styles.dropzoneSub}>
              jpeg / png / webp · ≤ 10 mb · 1 face frontal · est. cost €0.13 / run
            </span>
          </div>
        </label>
        {uploadError !== null && <ErrorBlock error={uploadError} onRetry={retryUpload} />}
      </section>

      {/* ── Past reports ────────────────────────────────────────────────── */}
      <section className={styles.listSection}>
        <span className={styles.sectionTitle}>RECENT REPORTS</span>
        {pageError !== null && <ErrorBlock error={pageError} />}
        {reports === null ? (
          <div className={styles.empty}>[ loading reports… ]</div>
        ) : reports.length === 0 ? (
          <div className={styles.empty}>
            [ no reports yet ] · drop a face photo above to fan out across all four OSINT layers
          </div>
        ) : (
          <div className={styles.table}>
            <div className={cn(styles.tableRow, styles.tableHeader)}>
              <span>CREATED</span>
              <span>REPORT ID</span>
              <span>STATUS</span>
              <span>FINISHED</span>
            </div>
            {reports.map((r) => (
              <Link key={r.id} href={`/sniper/${r.id}`} className={styles.tableRow}>
                <span className={styles.timeCell}>{formatTime(r.created_at)}</span>
                <span className={styles.idCell}>{r.id.slice(0, 12)}…</span>
                <StatusBadge status={r.status} />
                <span className={styles.timeCell}>
                  {r.completed_at ? formatTime(r.completed_at) : "—"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: ReportRow["status"] }) {
  const cls =
    status === "complete"
      ? styles.statusComplete
      : status === "failed"
        ? styles.statusFailed
        : styles.statusProcessing;
  return <span className={cn(styles.statusBadge, cls)}>{status.toUpperCase()}</span>;
}

function FirstRunLayerIntro({ summary }: { summary: SniperCostSummary }) {
  const layers = [
    {
      tag: "L1",
      name: "Identity",
      source: "pgvector kNN · ArcFace 512-D",
      cost: "free",
      desc: "Match the face against your registered POIs. Median-of-top-K voting on the embedding nearest neighbours.",
    },
    {
      tag: "L2",
      name: "Web Presence",
      source: "SerpAPI · Google Lens",
      cost: `€${summary.per_call_costs.serpapi.toFixed(2)}`,
      desc: "Reverse-image search across the public web. Returns visual matches with thumbnails + source URLs.",
    },
    {
      tag: "L3",
      name: "Geographic",
      source: "Picarta · location predict",
      cost: `€${summary.per_call_costs.picarta.toFixed(2)}`,
      desc: "Predict where the photo was taken. Top-1 country/region/city + alternatives with confidence.",
    },
    {
      tag: "L4",
      name: "Authenticity",
      source: "Reality Defender · deepfake",
      cost: `€${summary.per_call_costs.reality_defender.toFixed(2)}`,
      desc: "Authentic / deepfake / uncertain verdict on the input. Mock by default; real-mode via env.",
    },
  ];
  const total =
    summary.per_call_costs.serpapi +
    summary.per_call_costs.picarta +
    summary.per_call_costs.reality_defender;

  return (
    <section className={styles.firstRun}>
      <span className={styles.firstRunEyebrow}>WHAT YOU GET PER QUERY</span>
      <div className={styles.firstRunGrid}>
        {layers.map((l) => (
          <div key={l.tag} className={styles.firstRunCard}>
            <div className={styles.firstRunCardHead}>
              <span className={styles.firstRunCardTag}>{l.tag}</span>
              <span className={styles.firstRunCardCost}>{l.cost}</span>
            </div>
            <span className={styles.firstRunCardName}>{l.name}</span>
            <span className={styles.firstRunCardSource}>{l.source}</span>
            <p className={styles.firstRunCardDesc}>{l.desc}</p>
          </div>
        ))}
      </div>
      <p className={styles.firstRunFooter}>
        Total per query ≈ €{total.toFixed(2)}. Failed layers (upstream timeout, rate-limit, etc.)
        do not stop the others — partial reports are surfaced with explicit per-layer status.
      </p>
    </section>
  );
}

function BudgetWidget({ summary }: { summary: SniperCostSummary }) {
  const usedPct = Math.min(100, (summary.total_today_eur / summary.cap_eur) * 100);
  const perRunEstimate =
    summary.per_call_costs.serpapi +
    summary.per_call_costs.picarta +
    summary.per_call_costs.reality_defender;
  // Warn when next run wouldn't fit; halt when no headroom at all.
  const warn = summary.headroom_eur < perRunEstimate;
  const halt = summary.headroom_eur <= 0;

  return (
    <div className={cn(styles.budget, warn && styles.budgetWarn, halt && styles.budgetHalt)}>
      <span className={styles.budgetLabel}>BUDGET TODAY</span>
      <span className={styles.budgetValue}>
        €{summary.total_today_eur.toFixed(2)} / €{summary.cap_eur.toFixed(2)}
      </span>
      <div className={styles.budgetBar}>
        <div className={styles.budgetBarFill} style={{ width: `${usedPct}%` }} />
      </div>
      <span className={styles.budgetHint}>
        next run ~€{perRunEstimate.toFixed(2)} · headroom €{summary.headroom_eur.toFixed(2)}
      </span>
    </div>
  );
}
