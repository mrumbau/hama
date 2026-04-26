// Argus server bootstrap.
//
// Day 1 stub: enough to start, prove the workspace boots, prove env loading works.
// Tag 3 replaces this with full middleware pipeline:
//   helmet · pino-http · cors · JWT verify · /api/* routers · error handler.

import "dotenv/config";
import express from "express";

const app = express();
const PORT = Number(process.env.PORT ?? 5000);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "argus-server",
    version: process.env.npm_package_version ?? "0.1.0",
    day: 1,
  });
});

app.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[argus-server] listening on http://127.0.0.1:${PORT}`);
});
