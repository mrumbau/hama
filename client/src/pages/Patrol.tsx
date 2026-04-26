import { useEffect, useRef, useState, type CSSProperties } from "react";
import Webcam from "react-webcam";

import { recognizeApi, type RecognizeFace, type RecognizeResponse } from "../lib/recognize";
import { subscribeToEvents, unsubscribe, type EventInsertPayload } from "../lib/realtime";
import { cn } from "../lib/cn";
import styles from "./Patrol.module.css";

const CAMERA_ID = "webcam-0";
const FRAME_INTERVAL_MS = 350; // ~3 fps; Tag 7 ByteTrack pushes the cap higher
const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;
const FEED_LIMIT = 8;

type FeedRow = {
  id: string;
  ts: number;
  name: string;
  category: string;
  score: number;
  isNew: boolean;
};

function formatTime(t: number): string {
  const d = new Date(t);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function Patrol() {
  const webcamRef = useRef<Webcam | null>(null);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RecognizeResponse | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({
    w: FRAME_WIDTH,
    h: FRAME_HEIGHT,
  });

  // ── Realtime events feed (always on, regardless of patrol running state) ─
  useEffect(() => {
    const channel = subscribeToEvents((row: EventInsertPayload) => {
      setFeed((prev) =>
        [
          {
            id: row.id,
            ts: new Date(row.created_at).getTime(),
            name: row.poi_id ?? "unknown",
            category: row.kind,
            score: row.score,
            isNew: true,
          },
          ...prev.filter((r) => r.id !== row.id),
        ].slice(0, FEED_LIMIT),
      );
      // Drop the new-row highlight after the flash animation.
      window.setTimeout(() => {
        setFeed((prev) => prev.map((r) => (r.id === row.id ? { ...r, isNew: false } : r)));
      }, 800);
    });
    return () => {
      void unsubscribe(channel);
    };
  }, []);

  // ── Frame loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      if (cancelled || !webcamRef.current) return;
      const dataUrl = webcamRef.current.getScreenshot({
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
      });
      if (!dataUrl) {
        timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
        return;
      }
      // Strip the data:image/jpeg;base64, prefix — the server accepts both
      // but the prefix wastes bytes per frame.
      const b64 = dataUrl.includes("base64,") ? dataUrl.split("base64,", 2)[1] : dataUrl;
      const result = await recognizeApi.recognize(b64, CAMERA_ID);
      if (cancelled) return;
      if (result) {
        setLast(result);
        setFrameSize({ w: result.image.width, h: result.image.height });
        // Inject local matches into the feed too — the Realtime push covers
        // events but only for matches. Local rendering covers detect-only frames.
        for (const f of result.faces) {
          if (f.match?.event_id) {
            const id = f.match.event_id;
            setFeed((prev) => {
              if (prev.some((r) => r.id === id)) return prev;
              return [
                {
                  id,
                  ts: Date.now(),
                  name: f.match!.full_name,
                  category: f.match!.category,
                  score: f.match!.similarity,
                  isNew: true,
                },
                ...prev,
              ].slice(0, FEED_LIMIT);
            });
          }
        }
        setError(null);
      } else {
        setError("recognize failed (network or ml)");
      }
      timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [running]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PATROL / LIVE</span>
          <h1 className={styles.title}>Patrol</h1>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={cn(styles.toggle, running && styles.toggleLive)}
            onClick={() => setRunning((v) => !v)}
          >
            {running ? "■ stop patrol" : "▶ start patrol"}
          </button>
        </div>
      </header>

      <div className={styles.viewport}>
        <div className={styles.viewportInner}>
          <Webcam
            ref={webcamRef}
            className={styles.video}
            audio={false}
            mirrored={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.7}
            videoConstraints={{
              width: { ideal: FRAME_WIDTH },
              height: { ideal: FRAME_HEIGHT },
              facingMode: "user",
            }}
          />
          {running && <div className={styles.scanLine} aria-hidden="true" />}
          {last && <BboxOverlay faces={last.faces} frameW={frameSize.w} frameH={frameSize.h} />}
        </div>
      </div>

      <div className={styles.statusBar}>
        <span className={styles.liveDot}>
          <span
            className={cn(styles.liveDotIndicator, !running && styles.liveDotIdle)}
            aria-hidden="true"
          />
          {running ? "LIVE" : "IDLE"}
        </span>
        <span>
          camera: <span className={styles.statusValue}>{CAMERA_ID}</span>
        </span>
        <span>
          faces: <span className={styles.statusValue}>{last?.faces.length ?? 0}</span>
        </span>
        <span>
          matches:{" "}
          <span className={styles.statusValue}>
            {last?.faces.filter((f) => f.match).length ?? 0}
          </span>
        </span>
        {last && (
          <span style={{ marginLeft: "auto" }}>
            ml: detect <span className={styles.statusValue}>{last.latency_ms.detect}ms</span> · knn{" "}
            <span className={styles.statusValue}>{last.latency_ms.knn}ms</span> · total{" "}
            <span className={styles.statusValue}>{last.latency_ms.total}ms</span>
          </span>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.feedSection}>
        <span className={styles.feedTitle}>recent events (realtime)</span>
        {feed.length === 0 ? (
          <div className={styles.empty}>[ no events yet — start patrol or wait ]</div>
        ) : (
          <div className={styles.feedTable}>
            <div className={cn(styles.feedRow, styles.feedRowHeader)}>
              <span>TIME</span>
              <span>POI</span>
              <span>KIND</span>
              <span className={styles.feedScore}>SCORE</span>
              <span className={styles.feedStatus}>STATUS</span>
            </div>
            {feed.map((row) => (
              <div key={row.id} className={cn(styles.feedRow, row.isNew && styles.feedNew)}>
                <span className={styles.feedTime}>{formatTime(row.ts)}</span>
                <span className={styles.feedName}>{row.name}</span>
                <span className={styles.feedCategory}>{row.category}</span>
                <span className={styles.feedScore}>{row.score.toFixed(3)}</span>
                <span className={styles.feedStatus}>pending</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Bbox overlay: maps frame-pixel coords onto the rendered video ──────────

function BboxOverlay({
  faces,
  frameW,
  frameH,
}: {
  faces: RecognizeFace[];
  frameW: number;
  frameH: number;
}) {
  return (
    <div className={styles.overlay}>
      {faces.map((f, i) => {
        const left = `${(f.bbox.x / frameW) * 100}%`;
        const top = `${(f.bbox.y / frameH) * 100}%`;
        const width = `${(f.bbox.w / frameW) * 100}%`;
        const height = `${(f.bbox.h / frameH) * 100}%`;
        const color = f.match ? "var(--color-bbox-confirmed)" : "var(--color-bbox)";
        const style = {
          left,
          top,
          width,
          height,
          "--bbox-color": color,
        } as CSSProperties;
        return (
          <div key={i} className={styles.bbox} style={style}>
            <span className={styles.bboxLabel}>
              {f.match
                ? `${f.match.full_name.toUpperCase()} · ${f.match.similarity.toFixed(2)}`
                : `unknown · ${f.det_score.toFixed(2)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
