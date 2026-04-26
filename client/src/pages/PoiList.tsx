import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";

import { ErrorBlock } from "../components/ErrorBlock";
import { poiApi, type Poi } from "../lib/poi";
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
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(() => {
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
        setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PEOPLE</span>
          <h1 className={styles.title}>People</h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/poi/new" className={styles.primaryButton}>
            + add person
          </Link>
        </div>
      </header>

      {error !== null && <ErrorBlock error={error} onRetry={refresh} />}

      {rows !== null && rows.length === 0 && (
        <div className={styles.firstRun}>
          <span className={styles.firstRunEyebrow}>FIRST TIME HERE</span>
          <h2 className={styles.firstRunHeadline}>No people added yet.</h2>
          <p className={styles.firstRunBody}>
            Add someone by uploading 3 clear photos of their face. Once added, the live camera
            will flag this person when they appear in the frame, and a face search will return
            them as a match.
          </p>
          <p className={styles.firstRunBody}>
            You can also run a face search right now without adding anyone — the search still
            returns web hits, location guess, and authenticity check.
          </p>
          <div className={styles.firstRunActions}>
            <Link href="/poi/new" className={styles.primaryButton}>
              + add person
            </Link>
            <Link href="/sniper" className={styles.firstRunSecondary}>
              or search a face directly →
            </Link>
          </div>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div>
          <div className={styles.tableHeader}>
            <span>ID</span>
            <span>NAME</span>
            <span>TAG</span>
            <span className={styles.embeddings}>PHOTOS</span>
            <span className={styles.threshold}>STRICTNESS</span>
            <span className={styles.timestamp}>ADDED</span>
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
                  {active ? "active" : "needs photos"}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className={styles.footer}>
        <span>
          [ {rows?.length ?? "…"} PEOPLE · ADD ≥ {ENROLMENT_TARGET} PHOTOS TO ACTIVATE ]
        </span>
      </div>
    </div>
  );
}
