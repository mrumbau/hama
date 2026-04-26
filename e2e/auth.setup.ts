/**
 * Sign-in setup — runs once before any test project.
 *
 * Reads the operator credentials from env (E2E_TEST_USER_EMAIL +
 * E2E_TEST_USER_PASSWORD), drives the real Login form against the live
 * Supabase Auth, then persists the resulting storage state to
 * e2e/.auth/operator.json. Subsequent test specs use this state via
 * the `chromium` project's `storageState` config so each spec starts
 * already authenticated — the Login form is exercised separately in
 * tests/auth.spec.ts (which uses an empty storage state).
 *
 * The storage-state file is gitignored. CI sets the credentials via
 * encrypted environment variables.
 */

import { expect, test as setup } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/operator.json";

setup("authenticate operator", async ({ page }) => {
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD must be set (see e2e/.env.example)",
    );
  }

  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // After a successful sign-in the AppShell is rendered with the POI
  // navigation link active. Wait for it before persisting state so the
  // session cookie is fully written.
  await expect(page.getByRole("link", { name: /^POI$/ })).toBeVisible();
  await expect(page).toHaveURL(/\/poi/);

  await page.context().storageState({ path: STORAGE_STATE });
});
