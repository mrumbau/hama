/**
 * Sniper Mode orchestrator (ADR-6).
 *
 * Tag 8a — backbone:
 *   * `runSniperReport` uploads the query image, inserts the
 *     `fusion_reports` row + 4 `fusion_layers` rows, kicks off Layer 1
 *     synchronously, and returns the report id. Layers 2-4 stay
 *     'pending' until Tag 8b plugs them in.
 *   * `updateLayer{Running,Done,Failed}` are the per-layer state
 *     machine helpers. They issue the UPDATE statements that Supabase
 *     Realtime then pushes to the operator UI (ADR-7) — the same
 *     mechanism Tag 6 uses for events.
 *   * `finalizeReport` walks all four layers and promotes
 *     `fusion_reports.status` to 'complete' if every layer is done,
 *     'failed' if any layer failed, else leaves it 'processing'.
 *
 * Tag 8b will turn the Layer 1 synchronous call into a parallel fan-out
 * that includes Layers 2-4, gated by the cost guard + circuit breakers.
 */

import { sql } from "drizzle-orm";

import { db } from "../db.js";
import { logger } from "../lib/pino.js";
import { uploadToBucket } from "../lib/storage.js";
import type { FusionLayer, IdentityPayload } from "@argus/shared/fusion";

import { runIdentityLayer } from "./layers/identity.js";

export interface SniperRunInput {
  operatorId: string;
  imageBuffer: Buffer;
  imageMime: string;
  imageB64: string;
}

export interface SniperRunResult {
  reportId: string;
  queryStoragePath: string;
  /** Layer 1 outcome inlined so the caller can log + return immediately. */
  layer1: { status: "done"; payload: IdentityPayload } | { status: "failed"; reason: string };
}

/**
 * Tag 8a: insert report + 4 layer rows, run Layer 1, return ids.
 * Layers 2-4 remain 'pending' (Tag 8b implements them).
 */
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

  // The 4 layer enum values are fixed; ADR-1 + plan §0.5 D4. Inserted in
  // a single statement so all 4 rows arrive in the same Realtime tick on
  // the operator UI (no flash of "3 of 4 layers exist").
  await db.execute(sql`
    INSERT INTO fusion_layers (report_id, layer, status)
    VALUES
      (${reportId}, 'identity'::fusion_layer_name, 'pending'::fusion_layer_status),
      (${reportId}, 'web_presence'::fusion_layer_name, 'pending'::fusion_layer_status),
      (${reportId}, 'geographic'::fusion_layer_name, 'pending'::fusion_layer_status),
      (${reportId}, 'authenticity'::fusion_layer_name, 'pending'::fusion_layer_status)
  `);

  // ── 3. Run Layer 1 synchronously ─────────────────────────────────────────
  await updateLayerRunning(reportId, "identity");
  const layer1 = await runIdentityLayer(input.imageB64);

  if (layer1.kind === "done") {
    await updateLayerDone(reportId, "identity", layer1.payload, layer1.latencyMs);
  } else {
    await updateLayerFailed(reportId, "identity", layer1.reason, layer1.latencyMs);
  }

  // ── 4. Finalise report status ────────────────────────────────────────────
  // Tag 8a: only Layer 1 has run. The other three are still 'pending', so
  // `finalizeReport` keeps the report in 'processing'. When Tag 8b runs
  // them in the same orchestrator call, the post-fanout `finalizeReport`
  // will be the one that promotes to 'complete'/'failed'.
  await finalizeReport(reportId);

  logger.info(
    { reportId, layer1_kind: layer1.kind, layer1_latency_ms: layer1.latencyMs },
    "sniper: tag-8a backbone run complete (layers 2-4 pending)",
  );

  return {
    reportId,
    queryStoragePath: upload.path,
    layer1:
      layer1.kind === "done"
        ? { status: "done", payload: layer1.payload }
        : { status: "failed", reason: layer1.reason },
  };
}

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
 * decided. Idempotent — safe to call multiple times during a fan-out.
 *
 *   any pending|running → leave 'processing'
 *   all done            → 'complete'
 *   any failed (rest done) → 'failed'
 */
export async function finalizeReport(reportId: string): Promise<void> {
  type Row = { status: string } & Record<string, unknown>;
  const result = await db.execute<Row>(sql`
    SELECT status FROM fusion_layers WHERE report_id = ${reportId}
  `);
  const statuses = result.rows.map((r) => r.status);
  if (statuses.length < 4) return; // partial insert — should never happen

  if (statuses.some((s) => s === "pending" || s === "running")) return;

  const finalStatus = statuses.some((s) => s === "failed") ? "failed" : "complete";
  await db.execute(sql`
    UPDATE fusion_reports
       SET status = ${finalStatus}::fusion_report_status,
           completed_at = now()
     WHERE id = ${reportId}
  `);
}
