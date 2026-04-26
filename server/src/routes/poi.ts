/**
 * POI router — enrolment + soft-delete + photo pipeline.
 *
 * Plan §3 enrolment flow per uploaded photo:
 *   1. Multer captures the file in memory (size capped via env).
 *   2. Upload bytes to private bucket `poi-photos/<uuid>.jpg` (service-role).
 *   3. ML POST /quality — face_size + blur + pose-yaw gate.
 *      → fail: cleanup the storage object, return 422 with reasons[].
 *   4. Reality Defender (mock by default — see ADR-4) authenticity check.
 *      → fail: cleanup, return 422 with reason="deepfake".
 *   5. ML POST /embed — 512-D ArcFace vector for the largest face.
 *      → fail (no_face / model_error): cleanup, propagate 422/502.
 *   6. INSERT face_embeddings(poi_id, embedding, source_storage_path,
 *      quality_score, authenticity_score). Service-role bypasses RLS.
 *
 * Storage cleanup on failure is best-effort and never blocks the
 * 422 response — orphan photos in the bucket are a Tag 14 OPERATIONS
 * concern (storage lifecycle policy).
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";

import { eq, isNull, and, desc } from "drizzle-orm";
import { faceEmbeddings, poi as poiTable } from "@argus/shared/schema";

import { db } from "../db.js";
import { env } from "../env.js";
import { logger } from "../lib/pino.js";
import { ml, MlError } from "../lib/ml-client.js";
import { deleteFromBucket, signedReadUrl, uploadToBucket } from "../lib/storage.js";
import { checkAuthenticity, imageHash } from "../external/reality-defender.js";

export const poiRouter = Router();

// ── Validation ──────────────────────────────────────────────────────────────

const POI_CATEGORIES = ["vip", "guest", "staff", "banned", "missing"] as const;

const createPoiBody = z.object({
  full_name: z.string().min(1).max(200),
  category: z.enum(POI_CATEGORIES),
  notes: z.string().max(2000).optional(),
  threshold: z.number().min(0).max(1).optional(),
});

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.POI_PHOTO_MAX_BYTES,
    files: env.POI_PHOTOS_MAX_PER_REQUEST,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new MulterFileTypeError(file.mimetype));
      return;
    }
    cb(null, true);
  },
});

class MulterFileTypeError extends Error {
  constructor(public mimetype: string) {
    super(`unsupported_mime_type: ${mimetype}`);
    this.name = "MulterFileTypeError";
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function bufferToBase64(buf: Buffer): string {
  return buf.toString("base64");
}

async function ensurePoiExists(id: string, ownerId: string): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: poiTable.id })
    .from(poiTable)
    .where(and(eq(poiTable.id, id), isNull(poiTable.deletedAt)))
    .limit(1);
  if (!rows.length) return null;
  // Note: any operator can enrol photos onto any POI per plan §10. The
  // owner-id parameter is only used for the audit trail (events.operator_id).
  void ownerId;
  return rows[0];
}

// ── Routes ──────────────────────────────────────────────────────────────────

poiRouter.get("/", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: poiTable.id,
      fullName: poiTable.fullName,
      category: poiTable.category,
      threshold: poiTable.threshold,
      notes: poiTable.notes,
      createdAt: poiTable.createdAt,
      createdBy: poiTable.createdBy,
    })
    .from(poiTable)
    .where(isNull(poiTable.deletedAt))
    .orderBy(desc(poiTable.createdAt));

  // Embedding counts per POI — small N for the demo, single round-trip.
  const counts = await db
    .select({
      poiId: faceEmbeddings.poiId,
      count: faceEmbeddings.id,
    })
    .from(faceEmbeddings);
  const countByPoi = new Map<string, number>();
  for (const c of counts) {
    countByPoi.set(c.poiId, (countByPoi.get(c.poiId) ?? 0) + 1);
  }

  res.json({
    poi: rows.map((r) => ({
      ...r,
      embedding_count: countByPoi.get(r.id) ?? 0,
    })),
  });
});

poiRouter.post("/", async (req: Request, res: Response) => {
  const parsed = createPoiBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    return;
  }
  const operatorId = req.auth!.sub;
  const [row] = await db
    .insert(poiTable)
    .values({
      fullName: parsed.data.full_name,
      category: parsed.data.category,
      notes: parsed.data.notes,
      threshold: parsed.data.threshold ?? undefined,
      createdBy: operatorId,
    })
    .returning();
  logger.info({ poiId: row.id, operatorId }, "poi: created");
  res.status(201).json({ poi: row });
});

poiRouter.get("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const rows = await db
    .select()
    .from(poiTable)
    .where(and(eq(poiTable.id, id), isNull(poiTable.deletedAt)))
    .limit(1);
  if (!rows.length) {
    res.status(404).json({ error: "poi_not_found" });
    return;
  }

  const photos = await db
    .select({
      id: faceEmbeddings.id,
      storagePath: faceEmbeddings.sourceStoragePath,
      qualityScore: faceEmbeddings.qualityScore,
      authenticityScore: faceEmbeddings.authenticityScore,
      createdAt: faceEmbeddings.createdAt,
    })
    .from(faceEmbeddings)
    .where(eq(faceEmbeddings.poiId, id))
    .orderBy(desc(faceEmbeddings.createdAt));

  // Resolve short-lived signed URLs for the gallery preview.
  const photosWithUrls = await Promise.all(
    photos.map(async (p) => ({
      ...p,
      signed_url: await signedReadUrl("poi-photos", p.storagePath).catch((err) => {
        logger.warn({ err, path: p.storagePath }, "poi: signed-url failed");
        return null;
      }),
    })),
  );

  res.json({ poi: rows[0], photos: photosWithUrls });
});

poiRouter.delete("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const result = await db
    .update(poiTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(poiTable.id, id), isNull(poiTable.deletedAt)))
    .returning({ id: poiTable.id });
  if (!result.length) {
    res.status(404).json({ error: "poi_not_found" });
    return;
  }
  logger.info({ poiId: id, operatorId: req.auth!.sub }, "poi: soft-deleted");
  res.status(204).send();
});

// ── Photo pipeline (the core of Tag 5) ─────────────────────────────────────

poiRouter.post(
  "/:id/photos",
  upload.single("image"),
  async (req: Request, res: Response): Promise<void> => {
    const poiId = String(req.params.id);
    const operatorId = req.auth!.sub;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "image_field_required" });
      return;
    }

    // Verify the POI exists and is not deleted.
    const exists = await ensurePoiExists(poiId, operatorId);
    if (!exists) {
      res.status(404).json({ error: "poi_not_found" });
      return;
    }

    let storagePath: string | null = null;
    try {
      // 1. Storage upload (service-role).
      const upload = await uploadToBucket("poi-photos", file.buffer, file.mimetype);
      storagePath = upload.path;

      const imageB64 = bufferToBase64(file.buffer);

      // 2. Quality gate.
      const quality = await ml.quality(imageB64);
      if (!quality.passes) {
        await cleanup(storagePath);
        res.status(422).json({
          error: "quality_gate_failed",
          reasons: quality.reasons,
          metrics: quality.metrics,
        });
        return;
      }

      // 3. Authenticity gate (Reality Defender — mock by default).
      const authenticity = await checkAuthenticity(file.buffer);
      if (!authenticity.authentic) {
        await cleanup(storagePath);
        res.status(422).json({
          error: "deepfake_or_replay",
          verdict: authenticity.verdict,
          authenticity_score: authenticity.score,
          authenticity_source: authenticity.source,
        });
        return;
      }

      // 4. Embed.
      const embed = await ml.embed(imageB64);
      if (embed.embedding_dim !== 512) {
        await cleanup(storagePath);
        res.status(502).json({ error: "ml_embedding_dim_mismatch", got: embed.embedding_dim });
        return;
      }

      // 5. Persist face_embedding row (service-role, bypasses RLS).
      const [row] = await db
        .insert(faceEmbeddings)
        .values({
          poiId,
          embedding: embed.embedding,
          sourceStoragePath: storagePath,
          qualityScore: quality.face?.det_score ?? 0,
          authenticityScore: authenticity.score,
        })
        .returning({ id: faceEmbeddings.id });

      logger.info(
        {
          poiId,
          operatorId,
          embeddingId: row.id,
          storagePath,
          quality: quality.metrics,
          authenticity: {
            verdict: authenticity.verdict,
            score: authenticity.score,
            source: authenticity.source,
            sha256: authenticity.sha256,
          },
        },
        "poi: photo enrolled",
      );

      res.status(201).json({
        embedding_id: row.id,
        storage_path: storagePath,
        quality: quality.metrics,
        authenticity: {
          verdict: authenticity.verdict,
          score: authenticity.score,
          source: authenticity.source,
        },
        face: embed.face,
      });
    } catch (err) {
      if (storagePath) await cleanup(storagePath);
      if (err instanceof MlError) {
        res
          .status(err.status === 422 ? 422 : 502)
          .json({ error: "ml_failure", endpoint: err.endpoint, reason: err.reason });
        return;
      }
      logger.error({ err, poiId, operatorId }, "poi: photo enrolment failed");
      res.status(500).json({ error: "internal_error" });
    }
  },
);

async function cleanup(path: string): Promise<void> {
  const result = await deleteFromBucket("poi-photos", path);
  if (!result.ok) logger.warn({ path, error: result.error }, "poi: storage cleanup failed");
}

// ── Multer error handler (mounted in index.ts after the router) ────────────

export function poiMulterErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: (err?: unknown) => void,
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "image_too_large", max_bytes: env.POI_PHOTO_MAX_BYTES });
      return;
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({ error: "too_many_files", max: env.POI_PHOTOS_MAX_PER_REQUEST });
      return;
    }
    res.status(400).json({ error: "upload_failed", code: err.code });
    return;
  }
  if (err instanceof MulterFileTypeError) {
    res.status(415).json({ error: "unsupported_mime_type", mimetype: err.mimetype });
    return;
  }
  next(err);
}

// re-export for testability
export { imageHash };
