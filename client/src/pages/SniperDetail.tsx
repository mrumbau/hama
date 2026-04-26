import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";

import { ApiError } from "../lib/api";
import {
  SkeletonAuthenticity,
  SkeletonGeographic,
  SkeletonIdentity,
  SkeletonWebPresence,
} from "../components/Skeleton";
import { sniperApi, type SniperLayerRow, type SniperReportRow } from "../lib/sniper";
import {
  subscribeToFusionLayers,
  subscribeToFusionReport,
  unsubscribe,
} from "../lib/realtime";
import { cn } from "../lib/cn";
import type {
  AuthenticityPayload,
  FusionLayer,
  GeographicPayload,
  IdentityPayload,
  WebPresencePayload,
} from "@argus/shared/fusion";
import styles from "./SniperDetail.module.css";

const LAYER_ORDER: FusionLayer[] = ["identity", "web_presence", "geographic", "authenticity"];
const LAYER_TITLE: Record<FusionLayer, string> = {
  identity: "MATCH",
  web_presence: "WEB",
  geographic: "PLACE",
  authenticity: "REAL?",
};
const LAYER_SOURCE: Record<FusionLayer, string> = {
  identity: "pgvector · ArcFace 512-D",
  web_presence: "SerpAPI · Google Lens",
  geographic: "Picarta",
  authenticity: "Reality Defender",
};

// Per-call costs charged when the cost-guard accepts the layer. These
// numbers come from the server's env (LAYER_COST_*_EUR); we hard-code
// them client-side for the audit-row badge so a network round-trip per
// page render isn't necessary. They drift if the operator changes env;
// rare and acceptable for a defence-mode dashboard.
const LAYER_COST_EUR: Record<FusionLayer, number> = {
  identity: 0,
  web_presence: 0.02,
  geographic: 0.01,
  authenticity: 0.1,
};

/**
 * Was the layer charged against the cost guard for this run? `true`
 * for `done` and for `failed` outcomes that originate inside the
 * upstream call (after the charge landed); `false` for the two
 * pre-call rejections (`circuit_open`, `cost_guard_exceeded`).
 */
function wasLayerCharged(row: SniperLayerRow | null): boolean {
  if (!row) return false;
  if (row.status === "done") return true;
  if (row.status === "failed") {
    const r = row.error_message ?? "";
    return !r.startsWith("circuit_open") && !r.startsWith("cost_guard_exceeded");
  }
  return false;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function SniperDetail() {
  const [, params] = useRoute<{ id: string }>("/sniper/:id");
  const reportId = params?.id ?? "";

  const [report, setReport] = useState<SniperReportRow | null>(null);
  const [querySignedUrl, setQuerySignedUrl] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<FusionLayer, SniperLayerRow | null>>({
    identity: null,
    web_presence: null,
    geographic: null,
    authenticity: null,
  });
  const [pageError, setPageError] = useState<string | null>(null);

  // ── Initial fetch via the polling endpoint ────────────────────────────
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await sniperApi.detail(reportId);
        if (cancelled) return;
        setReport(r.report);
        setQuerySignedUrl(r.query_signed_url);
        const next: Record<FusionLayer, SniperLayerRow | null> = {
          identity: null,
          web_presence: null,
          geographic: null,
          authenticity: null,
        };
        for (const l of r.layers) next[l.layer] = l;
        setLayers(next);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
        setPageError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // ── Realtime: layer rows + report header ──────────────────────────────
  useEffect(() => {
    if (!reportId) return;
    const layerCh = subscribeToFusionLayers(reportId, (row) => {
      setLayers((prev) => ({
        ...prev,
        [row.layer]: {
          layer: row.layer,
          status: row.status,
          payload: row.payload,
          error_message: row.error_message,
          latency_ms: row.latency_ms,
          started_at: row.started_at,
          finished_at: row.finished_at,
        },
      }));
    });
    const reportCh = subscribeToFusionReport(reportId, (row) => {
      setReport((prev) =>
        prev
          ? { ...prev, status: row.status, completed_at: row.completed_at }
          : {
              id: row.id,
              requested_by: row.requested_by,
              query_storage_path: row.query_storage_path,
              status: row.status,
              created_at: row.created_at,
              completed_at: row.completed_at,
            },
      );
    });
    return () => {
      void unsubscribe(layerCh);
      void unsubscribe(reportCh);
    };
  }, [reportId]);

  if (!reportId) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {querySignedUrl ? (
          <img
            className={styles.queryThumb}
            src={querySignedUrl}
            alt="query face"
            loading="eager"
          />
        ) : (
          <div className={styles.queryThumbPlaceholder}>?</div>
        )}
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>SEARCH RESULT</span>
          <h1 className={styles.title}>
            {report ? `Search ${report.id.slice(0, 8)}…` : "loading…"}
          </h1>
          {report && (
            <div className={styles.meta}>
              <span>started {formatTime(report.created_at)}</span>
              <span className={styles.metaSep}>·</span>
              <span>finished {formatTime(report.completed_at)}</span>
              <span className={styles.metaSep}>·</span>
              <ReportStatusBadge status={report.status} />
            </div>
          )}
        </div>
        <Link href="/sniper" className={styles.backLink}>
          ← back
        </Link>
      </header>

      {pageError && <div className={styles.error}>{pageError}</div>}

      <div className={styles.grid}>
        {LAYER_ORDER.map((name) => (
          <LayerColumn key={name} name={name} row={layers[name]} />
        ))}
      </div>
    </div>
  );
}

function ReportStatusBadge({ status }: { status: SniperReportRow["status"] }) {
  const cls =
    status === "complete"
      ? styles.reportComplete
      : status === "failed"
        ? styles.reportFailed
        : styles.reportProcessing;
  return <span className={cn(styles.reportBadge, cls)}>{status.toUpperCase()}</span>;
}

// ── Layer column ──────────────────────────────────────────────────────────

function LayerColumn({ name, row }: { name: FusionLayer; row: SniperLayerRow | null }) {
  const status = row?.status ?? "pending";
  return (
    <article className={cn(styles.column, styles[`column${capitalize(status)}`])}>
      <header className={styles.colHeader}>
        <span className={styles.colTitle}>{LAYER_TITLE[name]}</span>
        <LayerStatusDot status={status} />
      </header>
      <div className={styles.colSource}>{LAYER_SOURCE[name]}</div>

      <div className={styles.colBody}>
        {status === "pending" && <span className={styles.placeholder}>waiting…</span>}
        {status === "running" && <LayerSkeleton name={name} />}
        {status === "failed" && (
          <div className={styles.failBlock}>
            <span className={styles.failTitle}>FAILED</span>
            <span className={styles.failReason}>{row?.error_message ?? "unknown"}</span>
          </div>
        )}
        {status === "done" && row && <LayerPayload name={name} payload={row.payload} />}
      </div>

      <footer className={styles.colFooter}>
        <span>started {formatTime(row?.started_at ?? null)}</span>
        <span className={styles.colFooterRight}>
          <span className={styles.colCost}>
            {LAYER_COST_EUR[name] === 0
              ? "free"
              : wasLayerCharged(row)
                ? `€${LAYER_COST_EUR[name].toFixed(2)}`
                : "€0.00"}
          </span>
          <span>
            {row?.latency_ms !== null && row?.latency_ms !== undefined
              ? `${row.latency_ms}ms`
              : "—"}
          </span>
        </span>
      </footer>
    </article>
  );
}

function LayerStatusDot({
  status,
}: {
  status: "pending" | "running" | "done" | "failed";
}) {
  return <span className={cn(styles.statusDot, styles[`dot${capitalize(status)}`])} aria-hidden="true" />;
}

function LayerSkeleton({ name }: { name: FusionLayer }) {
  switch (name) {
    case "identity":
      return <SkeletonIdentity />;
    case "web_presence":
      return <SkeletonWebPresence />;
    case "geographic":
      return <SkeletonGeographic />;
    case "authenticity":
      return <SkeletonAuthenticity />;
  }
}

function capitalize<T extends string>(s: T): Capitalize<T> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<T>;
}

// ── Per-layer payload renderers ───────────────────────────────────────────

function LayerPayload({
  name,
  payload,
}: {
  name: FusionLayer;
  payload: SniperLayerRow["payload"];
}) {
  if (!payload) return <span className={styles.placeholder}>no result data</span>;
  switch (name) {
    case "identity":
      return <IdentityCard payload={payload as IdentityPayload} />;
    case "web_presence":
      return <WebPresenceCard payload={payload as WebPresencePayload} />;
    case "geographic":
      return <GeographicCard payload={payload as GeographicPayload} />;
    case "authenticity":
      return <AuthenticityCard payload={payload as AuthenticityPayload} />;
  }
}

function IdentityCard({ payload }: { payload: IdentityPayload }) {
  const matches = payload.matches.slice(0, 6);
  return (
    <div className={styles.identity}>
      <div className={styles.identitySummary}>
        <span className={styles.identityLabel}>{payload.has_strong_match ? "FOUND" : "no clear match"}</span>
        <span className={styles.identityCorpus}>corpus n={payload.corpus_size}</span>
      </div>
      {matches.length === 0 ? (
        <span className={styles.placeholder}>nobody in your library matches</span>
      ) : (
        <div className={styles.identityList}>
          {matches.map((m) => (
            <div key={m.poi_id} className={styles.identityRow}>
              <span className={styles.identityName}>{m.full_name}</span>
              <span className={styles.identityCategory}>{m.category}</span>
              <span className={styles.identityVotes}>{m.votes}/5</span>
              <SimilarityBar similarity={m.similarity} threshold={m.threshold} />
              <span className={styles.identityValue}>{m.similarity.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimilarityBar({ similarity, threshold }: { similarity: number; threshold: number }) {
  const pct = Math.max(0, Math.min(100, similarity * 100));
  const passes = similarity >= threshold;
  return (
    <div className={styles.simBar}>
      <div
        className={cn(styles.simBarFill, passes ? styles.simBarPass : styles.simBarFail)}
        style={{ width: `${pct}%` }}
      />
      <div className={styles.simBarThreshold} style={{ left: `${threshold * 100}%` }} />
    </div>
  );
}

function WebPresenceCard({ payload }: { payload: WebPresencePayload }) {
  const hits = payload.hits.slice(0, 6);
  return (
    <div className={styles.webPresence}>
      <div className={styles.webHeader}>
        <span className={styles.webCount}>
          {payload.hit_count} {payload.hit_count === 1 ? "hit" : "hits"}
        </span>
        <span className={styles.webEngine}>google lens</span>
      </div>
      {hits.length === 0 ? (
        <span className={styles.placeholder}>no matches on the public web</span>
      ) : (
        <div className={styles.webList}>
          {hits.map((h, i) => (
            <a
              key={`${i}-${h.url}`}
              className={styles.webRow}
              href={h.url}
              target="_blank"
              rel="noreferrer"
            >
              {h.thumbnail_url ? (
                <img className={styles.webThumb} src={h.thumbnail_url} alt="" loading="lazy" />
              ) : (
                <div className={styles.webThumbPlaceholder}>?</div>
              )}
              <div className={styles.webText}>
                <span className={styles.webTitle}>{h.title ?? "(untitled)"}</span>
                <span className={styles.webUrl}>{shortUrl(h.url)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host;
  } catch {
    return u;
  }
}

function GeographicCard({ payload }: { payload: GeographicPayload }) {
  const hasCoords =
    payload.coordinates !== null && Array.isArray(payload.coordinates) && payload.coordinates.length === 2;
  const mapsHref = hasCoords
    ? `https://www.google.com/maps?q=${payload.coordinates![0]},${payload.coordinates![1]}`
    : null;
  const altCount = payload.alternatives?.length ?? 0;
  return (
    <div className={styles.geographic}>
      <div className={styles.geoTop}>
        <span className={styles.geoCountry}>{payload.country ?? "—"}</span>
        <span className={styles.geoConfidence}>
          conf {Math.round(payload.confidence * 100)}%
        </span>
      </div>
      {(payload.region || payload.city) && (
        <div className={styles.geoSubLine}>
          {payload.region}
          {payload.region && payload.city ? " · " : ""}
          {payload.city}
        </div>
      )}
      {mapsHref && (
        <a className={styles.geoCoords} href={mapsHref} target="_blank" rel="noreferrer">
          {payload.coordinates![0].toFixed(4)}, {payload.coordinates![1].toFixed(4)} ↗
        </a>
      )}
      {altCount > 0 && (
        <div className={styles.geoAlternatives}>
          <span className={styles.altLabel}>other guesses</span>
          {payload.alternatives.slice(0, 4).map((a, i) => (
            <div key={i} className={styles.altRow}>
              <span>{a.country ?? "—"}</span>
              <span className={styles.altConf}>{Math.round(a.confidence * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthenticityCard({ payload }: { payload: AuthenticityPayload }) {
  const verdictCls =
    payload.verdict === "authentic"
      ? styles.authAuthentic
      : payload.verdict === "deepfake"
        ? styles.authDeepfake
        : styles.authUncertain;
  return (
    <div className={styles.authenticity}>
      <div className={cn(styles.authVerdict, verdictCls)}>{payload.verdict.toUpperCase()}</div>
      <div className={styles.authMeta}>
        <span>score {payload.score.toFixed(3)}</span>
        <span className={styles.authSep}>·</span>
        <span>{payload.source === "mock" ? "demo mode" : "live check"}</span>
      </div>
      <div className={styles.authHash}>sha256 {payload.sha256.slice(0, 16)}…</div>
    </div>
  );
}
