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
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./env.js";
import { logger } from "./lib/pino.js";
import { pingDb } from "./db.js";
import { requireAuth } from "./auth/jwt.js";
import { poiMulterErrorHandler, poiRouter } from "./routes/poi.js";
import { recognizeRouter } from "./routes/recognize.js";
import { sniperMulterErrorHandler, sniperRouter } from "./routes/sniper.js";

const app = express();

// ── Trust proxy ─────────────────────────────────────────────────────────────
// Render (and most PaaS reverse proxies) terminate TLS in front of the app
// and forward via X-Forwarded-* headers. Without `trust proxy`, every request
// reads as 127.0.0.1 — breaking rate limits, audit logs, and helmet's
// secure-cookie heuristics. The "1" tells Express to trust exactly one
// hop (the proxy) — never blindly trust(true) which would let a client
// spoof X-Forwarded-For.
if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ── CORS ────────────────────────────────────────────────────────────────────
// Dev: empty origin list → cors() reflects any origin (Vite proxy means the
//      browser sends same-origin requests anyway, so this is permissive
//      without being a real cross-origin window).
// Prod: comma-separated CORS_ORIGINS strictly enforced; credentials enabled
//       so the JWT in Authorization can flow from project-chaw.net.
const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: env.NODE_ENV === "production" && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
  }),
);

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

// Sniper Mode: 4-layer fusion engine (ADR-6). Tag 8a backbone runs
// Layer 1 synchronously; Layers 2-4 parallel-fanout lands in Tag 8b.
app.use("/api/sniper", sniperRouter);
app.use("/api/sniper", sniperMulterErrorHandler);

// ── 404 + error handler ────────────────────────────────────────────────────
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: "internal_error" });
});

// ── Listen ─────────────────────────────────────────────────────────────────
// Bind 127.0.0.1 in dev (Vite proxy lives on the same host) and 0.0.0.0
// in production (Render's edge proxies forward from outside the
// container — bind to all interfaces or the request never lands).
const bindHost = env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
const server = app.listen(env.PORT, bindHost, () => {
  logger.info({ port: env.PORT, host: bindHost }, "argus-server listening");
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
