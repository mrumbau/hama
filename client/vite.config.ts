import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Order matters: prefix-matched alias entries pick the first hit, so
    // the more-specific subpaths must come before the bare package name.
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@argus/shared/fusion", replacement: path.resolve(__dirname, "../shared/fusion.ts") },
      { find: "@argus/shared/schema", replacement: path.resolve(__dirname, "../shared/schema.ts") },
      { find: "@argus/shared", replacement: path.resolve(__dirname, "../shared/index.ts") },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
