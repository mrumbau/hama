import { useEffect, useState } from "react";

import { useAuth } from "../store/auth";
import { supabase } from "../lib/supabase";
import { subscribeToEvents, unsubscribe, type EventInsertPayload } from "../lib/realtime";
import { cn } from "../lib/cn";
import styles from "./Events.module.css";

interface EventRow {
  id: string;
  poi_id: string | null;
  poi_full_name: string | null;
  poi_category: string | null;
  kind: string;
  camera_id: string | null;
  score: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  operator_id: string | null;
  status: "pending" | "confirmed" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  isNew?: boolean;
}

interface EventQueryRow {
  id: string;
  poi_id: string | null;
  kind: string;
  camera_id: string | null;
  score: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  operator_id: string | null;
  status: "pending" | "confirmed" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  poi: { full_name: string; category: string } | null;
}

const PAGE_LIMIT = 30;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function Events() {
  const userId = useAuth((s) => s.user?.id ?? null);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await supabase
        .from("events")
        .select(
          "id, poi_id, kind, camera_id, score, bbox, operator_id, status, created_at, resolved_at, poi:poi_id(full_name, category)",
        )
        .order("created_at", { ascending: false })
        .limit(PAGE_LIMIT);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      const mapped: EventRow[] = (data as unknown as EventQueryRow[]).map((r) => ({
        id: r.id,
        poi_id: r.poi_id,
        poi_full_name: r.poi?.full_name ?? null,
        poi_category: r.poi?.category ?? null,
        kind: r.kind,
        camera_id: r.camera_id,
        score: r.score,
        bbox: r.bbox,
        operator_id: r.operator_id,
        status: r.status,
        created_at: r.created_at,
        resolved_at: r.resolved_at,
      }));
      setRows(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime: prepend new events as they land.
  useEffect(() => {
    const channel = subscribeToEvents(async (payload: EventInsertPayload) => {
      // Re-fetch the joined POI row for the new event so the table is consistent.
      const { data, error: err } = await supabase
        .from("events")
        .select(
          "id, poi_id, kind, camera_id, score, bbox, operator_id, status, created_at, resolved_at, poi:poi_id(full_name, category)",
        )
        .eq("id", payload.id)
        .single();
      if (err || !data) return;
      const r = data as unknown as EventQueryRow;
      const enriched: EventRow = {
        id: r.id,
        poi_id: r.poi_id,
        poi_full_name: r.poi?.full_name ?? null,
        poi_category: r.poi?.category ?? null,
        kind: r.kind,
        camera_id: r.camera_id,
        score: r.score,
        bbox: r.bbox,
        operator_id: r.operator_id,
        status: r.status,
        created_at: r.created_at,
        resolved_at: r.resolved_at,
        isNew: true,
      };
      setRows((prev) => [enriched, ...prev.filter((row) => row.id !== r.id)].slice(0, PAGE_LIMIT));
      window.setTimeout(() => {
        setRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, isNew: false } : row)));
      }, 800);
    });
    return () => {
      void unsubscribe(channel);
    };
  }, []);

  async function resolve(id: string, status: "confirmed" | "dismissed") {
    setResolving((prev) => new Set(prev).add(id));
    const { error: err } = await supabase
      .from("events")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id);
    setResolving((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (err) {
      setError(err.message);
      return;
    }
    setRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, status, resolved_at: new Date().toISOString() } : row,
      ),
    );
  }

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>EVENTS / AUDIT TRAIL</span>
          <h1 className={styles.title}>Events</h1>
        </div>
      </header>

      <div className={styles.summary}>
        <span>
          [ {rows.length} events · {pending} pending · realtime feed live ]
        </span>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {rows.length === 0 ? (
        <div className={styles.empty}>[ no events yet — start patrol mode ]</div>
      ) : (
        <div>
          <div className={styles.tableHeader}>
            <span>WHEN</span>
            <span>POI</span>
            <span>KIND</span>
            <span>CAMERA</span>
            <span className={styles.score}>SCORE</span>
            <span style={{ textAlign: "center" }}>STATUS</span>
            <span style={{ textAlign: "right" }}>ACTIONS</span>
          </div>
          {rows.map((row) => {
            const isMine = row.operator_id === userId;
            const isPending = row.status === "pending";
            const busy = resolving.has(row.id);
            return (
              <div key={row.id} className={cn(styles.tableRow, row.isNew && styles.feedNew)}>
                <span className={styles.timestamp}>{formatTime(row.created_at)}</span>
                <span className={styles.poiName}>{row.poi_full_name ?? "unknown"}</span>
                <span>
                  <span className={styles.kindChip}>{row.kind}</span>
                </span>
                <span className={styles.camera}>{row.camera_id ?? "—"}</span>
                <span className={styles.score}>{row.score.toFixed(3)}</span>
                <span
                  className={cn(
                    styles.status,
                    row.status === "pending" && styles.statusPending,
                    row.status === "confirmed" && styles.statusConfirmed,
                    row.status === "dismissed" && styles.statusDismissed,
                  )}
                >
                  {row.status}
                </span>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.actionConfirm}
                    onClick={() => void resolve(row.id, "confirmed")}
                    disabled={!isPending || !isMine || busy}
                    title={!isMine ? "only the assigned operator can resolve" : ""}
                  >
                    confirm
                  </button>
                  <button
                    type="button"
                    className={styles.actionDismiss}
                    onClick={() => void resolve(row.id, "dismissed")}
                    disabled={!isPending || !isMine || busy}
                    title={!isMine ? "only the assigned operator can resolve" : ""}
                  >
                    dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
