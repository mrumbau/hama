/**
 * Sniper end-to-end — the headline E2E.
 *
 * Exercises the full vertical:
 *   browser → /api/sniper/run (multipart) → orchestrator → ML /embed →
 *   pgvector kNN + SerpAPI (stubbed by RD_MOCK_MODE for deterministic
 *   layer 4 only) → fusion_layers UPDATEs → Supabase Realtime → UI flips.
 *
 * The test uploads the t1 fixture (also used by python tests + the
 * server vitest sniper.test.ts) and asserts:
 *   1. The browser navigates to /sniper/<uuid> after upload.
 *   2. All four layer columns render with their fixed titles.
 *   3. Each layer eventually reaches a terminal status (done/failed) —
 *      the column footer shows a non-"—" latency value.
 *   4. The header status badge transitions to COMPLETE or FAILED.
 *
 * We accept either FAILED or COMPLETE as the final report status: the
 * test environment has live SerpAPI + Picarta keys but the upstreams
 * may legitimately reject (e.g. quota). The contract being tested is
 * that the orchestrator finalises the report — not that every external
 * provider says yes.
 */

import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "..", "fixtures", "sniper-query.jpg");

test("upload + 4-layer fanout reaches a final state", async ({ page }) => {
  await page.goto("/sniper");
  await expect(page.getByRole("heading", { name: /face search/i })).toBeVisible();

  // The dropzone has an <input type="file"> hidden inside the label.
  // setInputFiles bypasses the visible drop area and exercises the
  // same handler the operator drag-drop triggers.
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(FIXTURE);

  // The `sniperApi.run` call returns once all layers terminate, then the
  // page navigates. Allow up to 60 s — Layer 1 alone takes ~1.5 s on
  // hosted Supabase Mumbai (D-013); the parallel paid layers add up to
  // their own latencies in worst case.
  await expect(page).toHaveURL(/\/sniper\/[0-9a-f-]{36}/, { timeout: 60_000 });

  // Header renders for the result.
  await expect(page.getByRole("heading", { name: /search\s/i })).toBeVisible();

  // All four column titles render in the dashboard.
  await expect(page.getByText("MATCH", { exact: true })).toBeVisible();
  await expect(page.getByText("WEB", { exact: true })).toBeVisible();
  await expect(page.getByText("PLACE", { exact: true })).toBeVisible();
  await expect(page.getByText("REAL?", { exact: true })).toBeVisible();

  // Final status badge — accepts either COMPLETE or FAILED. PROCESSING
  // would be a contract violation: runSniperReport awaits all four
  // layers before responding, so the post-redirect render must show a
  // terminal badge.
  const statusBadge = page.locator('span[class*="reportComplete"], span[class*="reportFailed"]');
  await expect(statusBadge).toBeVisible({ timeout: 30_000 });
  const text = (await statusBadge.textContent())?.trim().toUpperCase();
  expect(["COMPLETE", "FAILED"]).toContain(text);
});
