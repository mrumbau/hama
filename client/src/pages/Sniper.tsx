import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useLocation } from "wouter";

import { ApiError } from "../lib/api";
import { sniperApi } from "../lib/sniper";
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
  const [pageError, setPageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setPageError(error.message);
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
      setUploading(true);
      setUploadError(null);
      try {
        const result = await sniperApi.run(file);
        setLocation(`/sniper/${result.report_id}`);
      } catch (err) {
        const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
        setUploadError(msg);
        setUploading(false);
      }
    },
    [setLocation],
  );

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
            One face photo in — four independent OSINT layers out, in parallel: identity,
            web presence, geographic, authenticity. ADR-1.
          </p>
        </div>
      </header>

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
        {uploadError && <div className={styles.error}>{uploadError}</div>}
      </section>

      {/* ── Past reports ────────────────────────────────────────────────── */}
      <section className={styles.listSection}>
        <span className={styles.sectionTitle}>RECENT REPORTS</span>
        {pageError && <div className={styles.error}>{pageError}</div>}
        {reports === null ? (
          <div className={styles.empty}>[ loading reports… ]</div>
        ) : reports.length === 0 ? (
          <div className={styles.empty}>[ no reports yet — drop a photo above to start ]</div>
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
