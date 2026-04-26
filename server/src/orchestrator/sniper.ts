/**
 * Sniper Mode orchestrator (ADR-6).
 *
 * Tag 8a landed the backbone: report + 4 layer rows, Layer 1 ran
 * synchronously, Layers 2-4 stayed pending. Tag 8b is the parallel
 * fan-out: all four layers fire via `Promise.allSettled`, each one
 * gated by its named circuit breaker + cost guard. Layer 1 keeps the
 * direct path because it has no upstream cost; Layers 2-4 carry the
 * full guard chain (breaker check → cost charge → run → record).
 *
 * Each per-layer dispatch is responsible for updating its own
 * `fusion_layers` row, so the operator UI's Realtime subscription
 * sees status flips as they happen — `running` when work starts,
 * `done`/`failed` with payload + latency when it finishes. The
 * orchestrator only finalizes the parent `fusion_reports.status` once
 * every layer has reached a terminal state.
 *
 * Failure semantics
 *   * `cost_guard_exceeded` — the operator hit COST_GUARD_DAILY_EUR
 *     before the layer could spend. The upstream is NOT called.
 *   * `circuit_open` — the breaker is in its open window after enough
 *     prior failures. The upstream is NOT called.
 *   * `<provider>_<status>_<reason>` — the upstream returned an error;
 *     the breaker counts this as a failure for next-time.
 */

import { sql } from "drizzle-orm";

import { db } from "../db.js";
import { env } from "../env.js";
import { getCircuitBreaker } from "../lib/circuit-breaker.js";
import { chargeOrReject, type CostGuardService } from "../lib/cost-guard.js";
import { logger } from "../lib/pino.js";
import { signedReadUrl, uploadToBucket } from "../lib/storage.js";
import type {
  AuthenticityPayload,
  FusionLayer,
  GeographicPayload,
  IdentityPayload,
  WebPresencePayload,
} from "@argus/shared/fusion";

import { runIdentityLayer, type LayerOutcome } from "./layers/identity.js";
import { runWebPresenceLayer } from "./layers/web-presence.js";
import { runGeographicLayer } from "./layers/geographic.js";
import { runAuthenticityLayer } from "./layers/authenticity.js";

export interface SniperRunInput {
  operatorId: string;
  imageBuffer: Buffer;
  imageMime: string;
  imageB64: string;
}

export interface LayerResult<T> {
  status: "done" | "failed";
  payload?: T;
  reason?: string;
  latencyMs: number;
}

export interface SniperRunResult {
  reportId: string;
  queryStoragePath: string;
  finalStatus: "complete" | "failed" | "processing";
  layers: {
    identity: LayerResult<IdentityPayload>;
    web_presence: LayerResult<WebPresencePayload>;
    geographic: LayerResult<GeographicPayload>;
    authenticity: LayerResult<AuthenticityPayload>;
  };
}

// ── Public entry point ─────────────────────────────────────────────────────

export async function runSniperReport(input: SniperRunInput): Promise<SniperRunResult> {
  // ── 1. Upload query to private bucket ────────────────────────────────────
  const upload = await uploadToBucket("sniper-queries", input.imageBuffer, input.imageMime);

  // ── 2. Insert fusion_reports + four fusion_layers ────────────────────────
  type ReportRow = { id: string } & Record<string, unknown>;
  const reportRes = await db.execute<ReportRow>(sql`
    INSERT INTO fusion_reports (requested_by, query_storage_path, status)
    VALUES (${input.operatorId}, ${upload.path}, 'processing'::fusion_report_status)
    RETURNING id
  `);
  const reportId = reportRes.rows[0]!.id;

  await db.execute(sql`
    INSERT INTO fusion_layers (report_id, layer, status)
    VALUES
      (${reportId}, 'identity'::fusion_layer_name, 'pending'::fusion_layer_status),
      (${reportId}, 'web_presence'::fusion_layer_name, 'pending'::fusion_layer_status),
      (${reportId}, 'geographic'::fusion_layer_name, 'pending'::fusion_layer_status),
      (${reportId}, 'authenticity'::fusion_layer_name, 'pending'::fusion_layer_status)
  `);

  // ── 3. Resolve a short-lived signed URL for SerpAPI ──────────────────────
  // SerpAPI fetches the image server-side from this URL. The bucket is
  // private, so we mint a 5-minute signed URL just before the call. If
  // the URL ever leaks it expires before any abuser can re-fetch.
  const signedUrl = await signedReadUrl("sniper-queries", upload.path);

  // ── 4. Parallel layer fan-out ────────────────────────────────────────────
  // Each helper updates its own fusion_layers row before returning, so
  // the operator UI's Realtime subscription sees status flips as they
  // happen. Promise.allSettled means a single layer's exception cannot
  // poison the report — the others still get to record their results.

  const [identityRes, webPresenceRes, geoRes, authRes] = await Promise.allSettled([
    runWithStateUpdate<IdentityPayload>(reportId, "identity", () =>
      runIdentityLayer(input.imageB64),
    ),
    runGuardedExternalLayer<WebPresencePayload>(reportId, input.operatorId, "web_presence", () =>
      runWebPresenceLayer(signedUrl),
    ),
    runGuardedExternalLayer<GeographicPayload>(reportId, input.operatorId, "geographic", () =>
      runGeographicLayer(input.imageB64),
    ),
    runGuardedExternalLayer<AuthenticityPayload>(reportId, input.operatorId, "authenticity", () =>
      runAuthenticityLayer(input.imageBuffer),
    ),
  ]);

  // ── 5. Finalise report status ────────────────────────────────────────────
  const finalStatus = await finalizeReport(reportId);

  logger.info(
    {
      reportId,
      finalStatus,
      identity: settledKind(identityRes),
      web_presence: settledKind(webPresenceRes),
      geographic: settledKind(geoRes),
      authenticity: settledKind(authRes),
    },
    "sniper: tag-8b parallel fan-out complete",
  );

  return {
    reportId,
    queryStoragePath: upload.path,
    finalStatus,
    layers: {
      identity: settledLayerResult(identityRes),
      web_presence: settledLayerResult(webPresenceRes),
      geographic: settledLayerResult(geoRes),
      authenticity: settledLayerResult(authRes),
    },
  };
}

// ── Per-layer dispatch helpers ─────────────────────────────────────────────

/**
 * Layer 1 path: no breaker, no cost guard. Just run the layer and
 * record its outcome to the fusion_layers row.
 */
async function runWithStateUpdate<T>(
  reportId: string,
  layer: FusionLayer,
  fn: () => Promise<LayerOutcome<T>>,
): Promise<LayerResult<T>> {
  await updateLayerRunning(reportId, layer);
  const outcome = await fn();
  if (outcome.kind === "done") {
    await updateLayerDone(reportId, layer, outcome.payload, outcome.latencyMs);
    return { status: "done", payload: outcome.payload, latencyMs: outcome.latencyMs };
  }
  await updateLayerFailed(reportId, layer, outcome.reason, outcome.latencyMs);
  return { status: "failed", reason: outcome.reason, latencyMs: outcome.latencyMs };
}

/**
 * Layers 2-4: carry the full guard chain.
 *   1. circuit-breaker check (skip call if open)
 *   2. cost-guard charge (skip + record reject if over cap)
 *   3. invoke the layer through the breaker (counts failures)
 *   4. record outcome
 */
async function runGuardedExternalLayer<T>(
  reportId: string,
  operatorId: string,
  layer: Exclude<FusionLayer, "identity">,
  fn: () => Promise<LayerOutcome<T>>,
): Promise<LayerResult<T>> {
  const t0 = Date.now();
  await updateLayerRunning(reportId, layer);

  const service = LAYER_SERVICE[layer];
  const cost = LAYER_COST[layer]();

  // ── 1. Circuit breaker check ──────────────────────────────────────────
  const breaker = getCircuitBreaker(service, {
    failureThreshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    openMs: env.CIRCUIT_BREAKER_OPEN_MS,
  });
  const inspected = breaker.inspect();
  if (inspected.state === "open") {
    const reason = "circuit_open";
    await updateLayerFailed(reportId, layer, reason, Date.now() - t0);
    return { status: "failed", reason, latencyMs: Date.now() - t0 };
  }

  // ── 2. Cost-guard charge ──────────────────────────────────────────────
  const charge = await chargeOrReject(operatorId, service, cost);
  if (!charge.allowed) {
    const reason = `cost_guard_exceeded:${charge.totalToday.toFixed(2)}/${charge.capEur.toFixed(2)}eur`;
    await updateLayerFailed(reportId, layer, reason, Date.now() - t0);
    return { status: "failed", reason, latencyMs: Date.now() - t0 };
  }

  // ── 3. Run via breaker ────────────────────────────────────────────────
  // Wrap `fn` so that a layer returning `kind: "failed"` propagates as
  // a thrown error inside breaker.run — this way the breaker counts a
  // single failure regardless of whether the layer module signalled the
  // problem by throwing or by returning a typed failure outcome. The
  // wrapper return narrows to the "done" branch so the success branch
  // below sees a concrete payload type.
  const breakerResult = await breaker.run<{ payload: T; latencyMs: number }>(async () => {
    const o = await fn();
    if (o.kind === "failed") {
      throw new LayerFailedError(o.reason, o.latencyMs);
    }
    return { payload: o.payload, latencyMs: o.latencyMs };
  });

  if (!breakerResult.ok) {
    let reason: string;
    let latencyMs = Date.now() - t0;
    if (breakerResult.reason === "circuit_open") {
      reason = "circuit_open";
    } else if (breakerResult.error instanceof LayerFailedError) {
      reason = breakerResult.error.layerReason;
      latencyMs = breakerResult.error.layerLatencyMs;
    } else {
      reason = `${service}_threw: ${breakerResult.error.message}`;
    }
    await updateLayerFailed(reportId, layer, reason, latencyMs);
    return { status: "failed", reason, latencyMs };
  }

  await updateLayerDone(reportId, layer, breakerResult.value.payload, breakerResult.value.latencyMs);
  return {
    status: "done",
    payload: breakerResult.value.payload,
    latencyMs: breakerResult.value.latencyMs,
  };
}

class LayerFailedError extends Error {
  constructor(
    public layerReason: string,
    public layerLatencyMs: number,
  ) {
    super(layerReason);
    this.name = "LayerFailedError";
  }
}

// ── Layer → service + cost mapping ─────────────────────────────────────────

const LAYER_SERVICE: Record<Exclude<FusionLayer, "identity">, CostGuardService> = {
  web_presence: "serpapi",
  geographic: "picarta",
  authenticity: "reality_defender",
};

// Functions so env-changes via test mocks are honoured per call.
const LAYER_COST: Record<Exclude<FusionLayer, "identity">, () => number> = {
  web_presence: () => env.LAYER_COST_WEB_PRESENCE_EUR,
  geographic: () => env.LAYER_COST_GEOGRAPHIC_EUR,
  authenticity: () => env.LAYER_COST_AUTHENTICITY_EUR,
};

// ── Per-layer state-machine helpers ────────────────────────────────────────

export async function updateLayerRunning(reportId: string, layer: FusionLayer): Promise<void> {
  await db.execute(sql`
    UPDATE fusion_layers
       SET status = 'running'::fusion_layer_status,
           started_at = now()
     WHERE report_id = ${reportId} AND layer = ${layer}::fusion_layer_name
  `);
}

export async function updateLayerDone(
  reportId: string,
  layer: FusionLayer,
  payload: unknown,
  latencyMs: number,
): Promise<void> {
  await db.execute(sql`
    UPDATE fusion_layers
       SET status = 'done'::fusion_layer_status,
           payload = ${JSON.stringify(payload)}::jsonb,
           latency_ms = ${latencyMs},
           finished_at = now(),
           error_message = NULL
     WHERE report_id = ${reportId} AND layer = ${layer}::fusion_layer_name
  `);
}

export async function updateLayerFailed(
  reportId: string,
  layer: FusionLayer,
  reason: string,
  latencyMs: number,
): Promise<void> {
  await db.execute(sql`
    UPDATE fusion_layers
       SET status = 'failed'::fusion_layer_status,
           error_message = ${reason},
           latency_ms = ${latencyMs},
           finished_at = now()
     WHERE report_id = ${reportId} AND layer = ${layer}::fusion_layer_name
  `);
}

/**
 * Walk all 4 layers; promote `fusion_reports.status` if the whole set is
 * decided. Returns the resolved status — caller logs/returns it.
 *
 *   any pending|running → leave 'processing'
 *   all done            → 'complete'
 *   any failed          → 'failed' (partial-success is still 'failed' overall;
 *                                    operator UI shows per-layer state)
 */
export async function finalizeReport(
  reportId: string,
): Promise<"complete" | "failed" | "processing"> {
  type Row = { status: string } & Record<string, unknown>;
  const result = await db.execute<Row>(sql`
    SELECT status FROM fusion_layers WHERE report_id = ${reportId}
  `);
  const statuses = result.rows.map((r) => r.status);
  if (statuses.length < 4) return "processing";

  if (statuses.some((s) => s === "pending" || s === "running")) return "processing";

  const finalStatus: "complete" | "failed" = statuses.some((s) => s === "failed")
    ? "failed"
    : "complete";

  await db.execute(sql`
    UPDATE fusion_reports
       SET status = ${finalStatus}::fusion_report_status,
           completed_at = now()
     WHERE id = ${reportId}
  `);
  return finalStatus;
}

// ── Tiny utilities for the response shape ──────────────────────────────────

function settledKind(s: PromiseSettledResult<LayerResult<unknown>>): string {
  return s.status === "fulfilled" ? s.value.status : "rejected";
}

function settledLayerResult<T>(s: PromiseSettledResult<LayerResult<T>>): LayerResult<T> {
  if (s.status === "fulfilled") return s.value;
  // Should never happen because runWith*/runGuarded* catch internally,
  // but defend the type.
  return {
    status: "failed",
    reason: `dispatcher_threw: ${(s.reason as Error).message ?? String(s.reason)}`,
    latencyMs: 0,
  };
}
