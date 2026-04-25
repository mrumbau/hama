import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { registerRoutes } from "./routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const clientDir = path.resolve(rootDir, "client");
const publicDir = path.resolve(clientDir, "public");
const uploadsDir = path.resolve(publicDir, "uploads");
const distPublicDir = path.resolve(rootDir, "dist", "public");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const isProd = process.env.NODE_ENV === "production";

fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.use((req, res, next) => {
  const started = Date.now();

  res.on("finish", () => {
    if (!req.path.startsWith("/")) return;
    const ms = Date.now() - started;

    let bodyPreview = "null";
    const anyRes = res as any;
    if (typeof anyRes.locals?.body !== "undefined") {
      try {
        bodyPreview =
          typeof anyRes.locals.body === "string"
            ? anyRes.locals.body
            : JSON.stringify(anyRes.locals.body);
      } catch {
        bodyPreview = "null";
      }
    }

    if (bodyPreview.length > 240) {
      bodyPreview = bodyPreview.slice(0, 240) + "…";
    }

    console.log(
      `[express] ${req.method} ${req.path} ${res.statusCode} in ${ms}ms :: ${bodyPreview}`,
    );
  });

  next();
});

app.use((_, res, next) => {
  const oldJson = res.json.bind(res);
  const oldSend = res.send.bind(res);

  (res as any).json = (body: any) => {
    (res as any).locals.body = body;
    return oldJson(body);
  };

  (res as any).send = (body: any) => {
    (res as any).locals.body = body;
    return oldSend(body);
  };

  next();
});

/* make uploads public */
app.use("/uploads", express.static(uploadsDir, { maxAge: 0 }));
app.use(express.static(publicDir, { maxAge: 0 }));

registerRoutes(app);

async function start() {
  if (!isProd) {
    const vite = await createViteServer({
      root: clientDir,
      server: {
        middlewareMode: true,
      },
      appType: "custom",
    });

    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      const url = req.originalUrl;

      if (url.startsWith("/api/")) return next();
      if (url.startsWith("/uploads/")) return next();
      if (url.includes(".")) return next();

      try {
        const indexHtmlPath = path.resolve(clientDir, "index.html");
        let template = await fs.promises.readFile(indexHtmlPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);

        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(distPublicDir, { maxAge: "1h" }));

    app.use((req, res, next) => {
      const url = req.originalUrl;

      if (url.startsWith("/api/")) return next();
      if (url.startsWith("/uploads/")) return next();
      if (url.includes(".")) return next();

      res.sendFile(path.resolve(distPublicDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[express] serving on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
