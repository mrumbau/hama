import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useLocation, useRoute } from "wouter";

import { ApiError } from "../lib/api";
import { poiApi, type PhotoUploadOutcome, type Poi, type PoiPhoto } from "../lib/poi";
import { describeReason } from "../lib/qualityReasons";
import { cn } from "../lib/cn";
import styles from "./PoiDetail.module.css";

const ENROLMENT_TARGET = 3;
const ENROLMENT_MAX = 5;

type UploadingTile = {
  id: string;
  filename: string;
  previewUrl: string;
  status: "queued" | "uploading" | "done" | "failed";
  outcome?: PhotoUploadOutcome;
};

export default function PoiDetail() {
  const [, params] = useRoute<{ id: string }>("/poi/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "";

  const [poi, setPoi] = useState<Poi | null>(null);
  const [photos, setPhotos] = useState<PoiPhoto[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadingTile[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const r = await poiApi.detail(id);
      setPoi(r.poi);
      setPhotos(r.photos);
      setPageError(null);
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
      setPageError(msg);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enrolledCount = photos.length;
  const inFlight = uploads.filter((u) => u.status !== "done").length;
  const slotsRemaining = Math.max(0, ENROLMENT_MAX - enrolledCount - inFlight);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const accept = list.slice(0, slotsRemaining);
      if (accept.length === 0) return;

      const newTiles: UploadingTile[] = accept.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filename: file.name,
        previewUrl: URL.createObjectURL(file),
        status: "queued",
      }));
      setUploads((prev) => [...prev, ...newTiles]);

      for (const tile of newTiles) {
        const file = accept[newTiles.indexOf(tile)];
        setUploads((prev) =>
          prev.map((u) => (u.id === tile.id ? { ...u, status: "uploading" } : u)),
        );
        const outcome = await poiApi.uploadPhoto(id, file);
        setUploads((prev) =>
          prev.map((u) =>
            u.id === tile.id
              ? { ...u, status: outcome.kind === "success" ? "done" : "failed", outcome }
              : u,
          ),
        );
        if (outcome.kind === "success") {
          await refresh();
          // Drop the tile from uploads once the gallery has the row.
          setTimeout(() => {
            setUploads((prev) => prev.filter((u) => u.id !== tile.id));
            URL.revokeObjectURL(tile.previewUrl);
          }, 1500);
        }
      }
    },
    [id, refresh, slotsRemaining],
  );

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files);
  }

  function onPicked(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files);
      e.target.value = "";
    }
  }

  async function onDelete() {
    if (!poi) return;
    if (!window.confirm(`Soft-delete POI "${poi.fullName}"?`)) return;
    try {
      await poiApi.softDelete(poi.id);
      setLocation("/poi");
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
      setPageError(msg);
    }
  }

  if (!id) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PERSON</span>
          <h1 className={styles.title}>{poi?.fullName ?? "loading…"}</h1>
          {poi && (
            <div className={styles.meta}>
              <span>{poi.id.slice(0, 12)}…</span>
              <span className={styles.metaSep}>{poi.category}</span>
              <span className={styles.metaSep}>strictness {poi.threshold.toFixed(2)}</span>
            </div>
          )}
        </div>
        {poi && (
          <div className={styles.headerActions}>
            <button type="button" className={styles.deleteBtn} onClick={onDelete}>
              delete
            </button>
          </div>
        )}
      </header>

      {pageError && <div className={styles.error}>{pageError}</div>}

      <div className={styles.summary}>
        <span className={cn(enrolledCount >= ENROLMENT_TARGET && styles.summaryActive)}>
          [ {enrolledCount} / {ENROLMENT_TARGET} photos ·{" "}
          {enrolledCount >= ENROLMENT_TARGET ? "active" : "needs more photos"} ]
        </span>
        <span>[ {ENROLMENT_MAX - enrolledCount - inFlight} slots left ]</span>
      </div>

      <div className={styles.gallery}>
        {photos.map((p) => (
          <article key={p.id} className={styles.tile}>
            {p.signed_url ? (
              <img className={styles.thumb} src={p.signed_url} alt="saved face" />
            ) : (
              <div className={styles.thumbPlaceholder}>image link expired</div>
            )}
            <div className={styles.tileMeta}>
              <div className={styles.tileMetaRow}>
                <span className={styles.tileMetaLabel}>quality</span>
                <span className={styles.tileMetaValue}>{p.qualityScore.toFixed(3)}</span>
              </div>
              <div className={styles.tileMetaRow}>
                <span className={styles.tileMetaLabel}>real?</span>
                <span className={styles.tileMetaValue}>
                  {p.authenticityScore !== null ? p.authenticityScore.toFixed(3) : "—"}
                </span>
              </div>
            </div>
          </article>
        ))}

        {uploads.map((u) => (
          <article key={u.id} className={styles.uploadingTile}>
            <img className={styles.uploadingThumb} src={u.previewUrl} alt="" />
            <div className={styles.uploadingStatus}>
              {u.status === "queued" && (
                <>
                  <span className={styles.statusDotPending} aria-hidden="true" />
                  queued
                </>
              )}
              {u.status === "uploading" && (
                <>
                  <span className={styles.statusDotRunning} aria-hidden="true" />
                  checking…
                </>
              )}
              {u.status === "done" && (
                <>
                  <span className={styles.statusDotDone} aria-hidden="true" />
                  saved
                </>
              )}
              {u.status === "failed" && (
                <>
                  <span className={styles.statusDotFail} aria-hidden="true" />
                  failed
                </>
              )}
            </div>
            {u.outcome?.kind === "quality_failed" && (
              <div className={styles.errorPanel}>
                {(u.outcome.reasons.length > 0 ? u.outcome.reasons : ["unknown"]).map((code) => {
                  const copy = describeReason(code);
                  return (
                    <div key={code} className={styles.errorReason}>
                      <span className={styles.errorReasonTitle}>{copy.title}</span>
                      {copy.hint && <span className={styles.errorReasonHint}>{copy.hint}</span>}
                      <span className={styles.errorReasonCode}>{code}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {u.outcome?.kind === "authenticity_failed" && (
              <div className={styles.errorPanel}>
                <span className={styles.errorReasons}>
                  image looks fake or manipulated ({u.outcome.verdict})
                </span>
              </div>
            )}
            {u.outcome?.kind === "image_too_large" && (
              <div className={styles.errorPanel}>
                <span className={styles.errorReasons}>
                  too large (max {Math.round(u.outcome.max_bytes / (1024 * 1024))} MB)
                </span>
              </div>
            )}
            {u.outcome?.kind === "unsupported_mime_type" && (
              <div className={styles.errorPanel}>
                <span className={styles.errorReasons}>
                  use a JPEG, PNG, or WebP file ({u.outcome.mimetype} not supported)
                </span>
              </div>
            )}
            {u.outcome?.kind === "other" && (
              <div className={styles.errorPanel}>
                <span className={styles.errorReasons}>
                  {u.outcome.status} {u.outcome.message}
                </span>
              </div>
            )}
          </article>
        ))}

        {slotsRemaining > 0 && (
          <label
            className={cn(styles.dropzone, dragging && styles.dropzoneDragging)}
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
              multiple
              onChange={onPicked}
            />
            <div className={styles.dropzoneText}>
              [ drop a photo here or click ]
              <span className={styles.dropzoneSub}>
                jpeg / png / webp · up to 50 MB · one face, looking forward, sharp
              </span>
            </div>
          </label>
        )}
      </div>

      <Link href="/poi" className={cn(styles.deleteBtn)} style={{ width: "fit-content" }}>
        ← back to people
      </Link>
    </div>
  );
}
