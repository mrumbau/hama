import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Webcam from "react-webcam";

import { recognizeApi, type RecognizeFace, type RecognizeResponse } from "../lib/recognize";
import { subscribeToEvents, unsubscribe, type EventInsertPayload } from "../lib/realtime";
import { cn } from "../lib/cn";
import styles from "./Patrol.module.css";

const CAMERA_ID = "webcam-0";
// Tag 7 (ADR-3): ByteTrack + Redis embedding cache cuts the per-frame
// ML cost on stable tracks (recycle path skips ArcFace inference). The
// frame interval drops accordingly — 150ms ≈ 6-7 fps target.
const FRAME_INTERVAL_MS = 150;
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
  // Coarse-pointer (touch) devices default to the back camera so the
  // operator can scan crowds; laptops keep the front-facing camera which
  // is what's been there since Tag 7. The toggle is also mobile-only in
  // the CSS — desktops typically only expose one camera.
  const [facingMode, setFacingMode] = useState<"user" | "environment">(() => {
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      return "environment";
    }
    return "user";
  });

  // Per-page-mount session id so ByteTrack state on the ML service
  // resets cleanly when the operator reloads the page. Without this
  // the previous session's track_ids would persist in Redis and the
  // first event would dedup against a stale row.
  const trackerStateKey = useMemo(() => {
    const session =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);
    return `${CAMERA_ID}:${session}`;
  }, []);

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
      const result = await recognizeApi.recognize(b64, CAMERA_ID, trackerStateKey);
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
  }, [running, trackerStateKey]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>LIVE CAMERA</span>
          <h1 className={styles.title}>Camera</h1>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.flipCam}
            onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
            aria-label="flip camera"
          >
            [ FLIP CAM ]
          </button>
          <button
            type="button"
            className={cn(styles.toggle, running && styles.toggleLive)}
            onClick={() => setRunning((v) => !v)}
          >
            {running ? "■ stop" : "▶ start"}
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
              facingMode,
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
            detect <span className={styles.statusValue}>{last.latency_ms.detect}ms</span> · match{" "}
            <span className={styles.statusValue}>{last.latency_ms.knn}ms</span> · total{" "}
            <span className={styles.statusValue}>{last.latency_ms.total}ms</span>
            {last.ml_metrics && (
              <>
                {" · embeds "}
                <span className={styles.statusValue}>
                  {last.ml_metrics.embeds_fresh ?? 0}f/{last.ml_metrics.embeds_recycled ?? 0}r
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.feedSection}>
        <span className={styles.feedTitle}>recent matches (live)</span>
        {feed.length === 0 ? (
          <div className={styles.empty}>[ no matches yet — start the camera or wait ]</div>
        ) : (
          <div className={styles.feedTable}>
            <div className={cn(styles.feedRow, styles.feedRowHeader)}>
              <span>TIME</span>
              <span>PERSON</span>
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
      {faces.map((f) => {
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
        // key=track_id keeps the same DOM node across consecutive
        // frames for the same person — React reuses the rectangle
        // instead of unmount+remount, which is what makes the colour
        // and label hold steady ("cyan stays cyan") through ByteTrack
        // re-association across small bbox shifts.
        return (
          <div key={f.track_id} className={styles.bbox} style={style}>
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
