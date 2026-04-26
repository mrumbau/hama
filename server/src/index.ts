/**
 * Argus server bootstrap.
 *
 * Tag 3: foundational middleware pipeline + auth wiring + /api/health,
 *        /api/me.
 * Tag 5: + /api/poi router (CRUD + photo enrolment pipeline).
 * Tag 6: + /api/recognize router (Patrol Mode hot path).
 * Tag 8+: sniper / events routers.
 */

import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./env.js";
import { logger } from "./lib/pino.js";
import { pingDb } from "./db.js";
import { requireAuth } from "./auth/jwt.js";
import { poiMulterErrorHandler, poiRouter } from "./routes/poi.js";
import { recognizeRouter } from "./routes/recognize.js";

const app = express();

// ── Security & logging ─────────────────────────────────────────────────────
app.use(helmet());
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res) =>
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

// ── Body parsers ───────────────────────────────────────────────────────────
// Plan §9 tightens the JSON limit relative to the predecessor (25MB →
// reasonable values per route). Fusion-report image uploads go straight to
// Supabase Storage, never through Express. JSON requests stay small.
app.use(express.json({ limit: "1mb" }));

// ── Public endpoints (no auth) ─────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    const ping = await pingDb();
    res.json({
      ok: true,
      service: "argus-server",
      day: 3,
      env: env.NODE_ENV,
      db: ping,
    });
  } catch (err) {
    logger.error({ err }, "health: db ping failed");
    res.status(503).json({ ok: false, error: "db_unreachable" });
  }
});

// ── Authenticated endpoints ────────────────────────────────────────────────
app.use("/api", requireAuth);

app.get("/api/me", (req, res) => {
  res.json({
    sub: req.auth!.sub,
    email: req.auth!.email,
    role: req.auth!.role,
  });
});

app.use("/api/poi", poiRouter);
app.use("/api/poi", poiMulterErrorHandler);

// Patrol-mode recognize endpoint. Frontend posts a 480p JPEG frame
// (~30-80 KB → ~110 KB base64) at 2-4 fps; the global 1mb JSON parser
// is comfortable. Tag 7 ByteTrack reduces frequency further.
app.use("/api/recognize", recognizeRouter);

// ── 404 + error handler ────────────────────────────────────────────────────
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: "internal_error" });
});

// ── Listen ─────────────────────────────────────────────────────────────────
const server = app.listen(env.PORT, "127.0.0.1", () => {
  logger.info({ port: env.PORT }, "argus-server listening");
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export { app };
