/**
 * POI registry smoke E2E.
 *
 * Authenticated operator lands on /poi and sees:
 *   * the page header with the "register" entry-point link,
 *   * a non-empty registry table — demo data is the Trump enrolment from
 *     Tag 5 plus the operator self-enrolment from Tag 6.
 *
 * The test is intentionally read-only — it does NOT enrol or delete a
 * POI. Tag 13 may add a full enrolment-flow E2E if the live ML can be
 * stubbed cheaply (right now it would burn ~1.5 s of buffalo_l inference
 * per test, costly to retry on CI).
 */

import { expect, test } from "@playwright/test";

test("user sees the People list header and at least one row", async ({ page }) => {
  await page.goto("/poi");
  await expect(page.getByRole("heading", { name: /^people$/i })).toBeVisible();
  // The "+ add person" CTA links to /poi/new (Tag 5 enrolment flow).
  await expect(page.getByRole("link", { name: /\+\s*add person/i })).toBeVisible();

  // At least one row link to /poi/<uuid>. The CSS-module class is
  // generated so we anchor on the href pattern instead of class names.
  // The "+ add person" button also matches /poi/new — exclude that with
  // a more specific UUID-shaped href.
  const rows = page.locator('a[href^="/poi/"]:not([href$="/new"])');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);
});
