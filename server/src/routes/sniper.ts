/**
 * Sniper Mode router (Tag 8).
 *
 *   POST /api/sniper/run        multipart upload of a query image →
 *                               kicks off a Sniper report (Layer 1
 *                               synchronous in 8a, Layers 2-4 in 8b)
 *                               and returns the report_id.
 *
 *   GET  /api/sniper/:id        polling fallback. The Sniper UI (Tag 9)
 *                               primarily reads layer state via the
 *                               Supabase Realtime channel on
 *                               `fusion_layers` — this endpoint exists
 *                               for direct API consumers and
 *                               post-disconnect catch-up.
 *
 * RLS already enforces "operator can only read their own reports"
 * (0004_rls_policies.sql), so the GET handler routes through the
 * service-role pool but applies the equivalent ownership check in
 * application code (admin override available via is_admin()).
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { sql } from "drizzle-orm";

import { db } from "../db.js";
import { env } from "../env.js";
import { dailySummary } from "../lib/cost-guard.js";
import { logger } from "../lib/pino.js";
import { signedReadUrl } from "../lib/storage.js";
import { runSniperReport } from "../orchestrator/sniper.js";

export const sniperRouter = Router();

// ── Upload configuration ────────────────────────────────────────────────────

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

class MulterFileTypeError extends Error {
  constructor(public mimetype: string) {
    super(`unsupported_mime_type: ${mimetype}`);
    this.name = "MulterFileTypeError";
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Sniper-queries bucket caps at 10 MB (0006_buckets.sql); match here.
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new MulterFileTypeError(file.mimetype));
      return;
    }
    cb(null, true);
  },
});

// ── POST /api/sniper/run ────────────────────────────────────────────────────

sniperRouter.post(
  "/run",
  upload.single("image"),
  async (req: Request, res: Response): Promise<void> => {
    const operatorId = req.auth!.sub;
    if (!req.file) {
      res.status(400).json({ error: "missing_image" });
      return;
    }

    try {
      const result = await runSniperReport({
        operatorId,
        imageBuffer: req.file.buffer,
        imageMime: req.file.mimetype,
        imageB64: req.file.buffer.toString("base64"),
      });
      res.status(201).json({
        report_id: result.reportId,
        query_storage_path: result.queryStoragePath,
        final_status: result.finalStatus,
        layers: result.layers,
      });
    } catch (err) {
      logger.error({ err, operatorId }, "sniper: run failed");
      res.status(500).json({ error: "sniper_run_failed" });
    }
  },
);

// ── GET /api/sniper/cost-summary ────────────────────────────────────────────

/**
 * Operator's spend for the current UTC day. Drives the budget headroom
 * widget on the Sniper landing page (Tag 10). Per-service breakdown lets
 * the UI explain *why* a layer might have been refused — e.g. "you've
 * hit the SerpAPI cap for today, web_presence will fail until 00:00 UTC".
 *
 * RLS gates the read (`daily_cost_ledger_select_own_or_admin`); the
 * service-role pool bypasses RLS, so the handler enforces "own only"
 * by passing `req.auth.sub` as the operator filter.
 */
sniperRouter.get("/cost-summary", async (req: Request, res: Response): Promise<void> => {
  const operatorId = req.auth!.sub;
  try {
    const summary = await dailySummary(operatorId);
    res.json({
      total_today_eur: summary.totalToday,
      cap_eur: summary.capEur,
      headroom_eur: Math.max(0, summary.capEur - summary.totalToday),
      per_service: summary.perService,
      // Per-call costs for the UI to render "next Sniper run will cost
      // ~Y if all 3 paid layers succeed".
      per_call_costs: {
        serpapi: env.LAYER_COST_WEB_PRESENCE_EUR,
        picarta: env.LAYER_COST_GEOGRAPHIC_EUR,
        reality_defender: env.LAYER_COST_AUTHENTICITY_EUR,
      },
    });
  } catch (err) {
    logger.error({ err, operatorId }, "sniper: cost-summary failed");
    res.status(500).json({ error: "cost_summary_failed" });
  }
});

// ── GET /api/sniper/:id ─────────────────────────────────────────────────────

sniperRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const operatorId = req.auth!.sub;

  // Service-role bypasses RLS, so we re-implement the policy check in app.
  type ReportRow = {
    id: string;
    requested_by: string;
    query_storage_path: string;
    status: string;
    created_at: string;
    completed_at: string | null;
  } & Record<string, unknown>;

  const reportResult = await db.execute<ReportRow>(sql`
    SELECT id, requested_by, query_storage_path, status,
           created_at, completed_at
    FROM fusion_reports
    WHERE id = ${id}
    LIMIT 1
  `);
  const report = reportResult.rows[0];
  if (!report) {
    res.status(404).json({ error: "report_not_found" });
    return;
  }
  if (report.requested_by !== operatorId && !req.auth!.role?.includes("admin")) {
    // The is_admin() RLS function reads from profiles; a JWT-claim check
    // is a coarser approximation, fine for this read endpoint.
    res.status(403).json({ error: "forbidden" });
    return;
  }

  type LayerRow = {
    layer: string;
    status: string;
    payload: unknown;
    error_message: string | null;
    latency_ms: number | null;
    started_at: string | null;
    finished_at: string | null;
  } & Record<string, unknown>;
  const layersResult = await db.execute<LayerRow>(sql`
    SELECT layer, status, payload, error_message, latency_ms,
           started_at, finished_at
    FROM fusion_layers
    WHERE report_id = ${id}
    ORDER BY layer
  `);

  // Mint a 60s signed URL for the query thumbnail so the detail page
  // can render the operator-facing preview. The bucket itself is
  // private (0006_buckets.sql); the URL is one-shot and short-lived.
  let querySignedUrl: string | null = null;
  try {
    querySignedUrl = await signedReadUrl("sniper-queries", report.query_storage_path);
  } catch (err) {
    logger.warn({ err, path: report.query_storage_path }, "sniper: query signed-url failed");
  }

  res.json({
    report: {
      id: report.id,
      requested_by: report.requested_by,
      query_storage_path: report.query_storage_path,
      status: report.status,
      created_at: report.created_at,
      completed_at: report.completed_at,
    },
    query_signed_url: querySignedUrl,
    layers: layersResult.rows,
  });
});

// ── Multer error handler — mounted as middleware after the router ──────────

export function sniperMulterErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: (e?: unknown) => void,
): void {
  if (err instanceof MulterFileTypeError) {
    res.status(415).json({ error: "unsupported_mime_type", mimetype: err.mimetype });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "image_too_large", max_bytes: 10 * 1024 * 1024 });
      return;
    }
    res.status(400).json({ error: "upload_failed", code: err.code });
    return;
  }
  next(err);
}

// Silence unused-warning when env is imported only by other modules.
void env;
