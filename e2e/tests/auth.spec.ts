/**
 * Auth flow E2E.
 *
 * Forces a clean storage state (no inherited login from setup) so this
 * test exercises the real Login form, JWKS verification round-trip,
 * and the post-sign-in redirect to /poi.
 *
 * The "wrong password" assertion proves the error-surfacing path works
 * — supabase.auth.signInWithPassword rejects, the form catches and
 * renders the error message, the URL stays at /login.
 */

import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("login redirects to /poi on success", async ({ page }) => {
  const email = process.env.E2E_TEST_USER_EMAIL!;
  const password = process.env.E2E_TEST_USER_PASSWORD!;

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /^sign in/i })).toBeVisible();

  await page.getByLabel("email").fill(email);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/poi/);
  // AppShell renders the nav after successful auth.
  await expect(page.getByRole("link", { name: /^PEOPLE$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^SEARCH$/ })).toBeVisible();
});

test("wrong password shows an error and stays on /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("email").fill("e2e-bogus@argus.test");
  await page.getByLabel("password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: /sign in/i }).click();

  // Error copy varies between Supabase versions; assert that *something*
  // appears in the error slot AND that we did not navigate away.
  await expect(page.locator('p[class*="formError"]')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
