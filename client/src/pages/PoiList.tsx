import { useEffect, useState } from "react";
import { Link } from "wouter";

import { poiApi, type Poi } from "../lib/poi";
import { ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import styles from "./PoiList.module.css";

const ENROLMENT_TARGET = 3;

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}

function categoryClass(category: Poi["category"]): string {
  switch (category) {
    case "banned":
      return styles.categoryBanned;
    case "missing":
      return styles.categoryMissing;
    case "vip":
      return styles.categoryVip;
    default:
      return "";
  }
}

export default function PoiList() {
  const [rows, setRows] = useState<Poi[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    poiApi
      .list()
      .then((r) => {
        if (cancelled) return;
        setRows(r.poi);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
        setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>POI / REGISTRY</span>
          <h1 className={styles.title}>POI Registry</h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/poi/new" className={styles.primaryButton}>
            + new poi
          </Link>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {rows !== null && rows.length === 0 && (
        <div className={styles.empty}>[ no poi enrolled · click + new poi to start ]</div>
      )}

      {rows !== null && rows.length > 0 && (
        <div>
          <div className={styles.tableHeader}>
            <span>POI ID</span>
            <span>FULL NAME</span>
            <span>CAT</span>
            <span className={styles.embeddings}>EMB</span>
            <span className={styles.threshold}>THR</span>
            <span className={styles.timestamp}>CREATED</span>
            <span className={styles.status}>STATUS</span>
          </div>
          {rows.map((p) => {
            const count = p.embedding_count ?? 0;
            const active = count >= ENROLMENT_TARGET;
            return (
              <Link key={p.id} href={`/poi/${p.id}`} className={styles.tableRow}>
                <span className={styles.id}>{p.id.slice(0, 12)}…</span>
                <span className={styles.name}>{p.fullName}</span>
                <span>
                  <span className={cn(styles.categoryChip, categoryClass(p.category))}>
                    {p.category}
                  </span>
                </span>
                <span className={cn(styles.embeddings, count === 0 && styles.embeddingsZero)}>
                  {count}/{ENROLMENT_TARGET}
                </span>
                <span className={styles.threshold}>{p.threshold.toFixed(2)}</span>
                <span className={styles.timestamp}>{formatRelative(p.createdAt)}</span>
                <span
                  className={cn(styles.status, active ? styles.statusActive : styles.statusEnrol)}
                >
                  {active ? "active" : "enrol"}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className={styles.footer}>
        <span>
          [ {rows?.length ?? "…"} POIS · ENROL ≥ {ENROLMENT_TARGET} EMBEDDINGS TO ACTIVATE ]
        </span>
      </div>
    </div>
  );
}
