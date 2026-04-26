/**
 * Playwright config — Tag 11 E2E tests.
 *
 * The tests assume the full local stack is up:
 *   * ML service on :8001 (`make ml.dev`)
 *   * Express server on :5000 (`pnpm --filter @argus/server dev`)
 *   * Vite client on :5173 (`pnpm --filter @argus/client dev`)
 *   * Local Redis (`brew services start redis`)
 *
 * We do not auto-spawn the stack — the dev workflow already requires it,
 * and orchestrating four processes inside Playwright would slow down
 * iteration without buying anything for the demo. `make e2e` documents
 * the pre-flight check.
 *
 * Auth: a single setup spec (auth.setup.ts) signs in once and persists
 * the storage state to e2e/.auth/operator.json. Subsequent specs reuse
 * that state — the Login flow itself is exercised in tests/auth.spec.ts.
 */

import { defineConfig, devices } from "@playwright/test";
import { config as loadEnvFile } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile({ path: join(__dirname, "e2e", ".env") });

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "github" : "list",
  fullyParallel: false, // shared DB state — serialise to keep cleanup simple
  workers: 1,
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // 1. Sign in once, write storageState to e2e/.auth/operator.json.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts$/,
    },
    // 2. Real specs depend on `setup` so they run after a fresh login.
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/operator.json",
      },
      dependencies: ["setup"],
    },
  ],
});
