import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    // Order matters: more-specific aliases first. Vite matches the first
    // entry whose key is a prefix of the import.
    alias: [
      {
        find: "@argus/shared/schema",
        replacement: path.resolve(__dirname, "../shared/schema.ts"),
      },
      {
        find: "@argus/shared/fusion",
        replacement: path.resolve(__dirname, "../shared/fusion.ts"),
      },
      {
        find: "@argus/shared",
        replacement: path.resolve(__dirname, "../shared/index.ts"),
      },
    ],
  },
});
