/**
 * Focused E2E: authentication error states (plan §5.4–§5.6, §6.2).
 *
 * Exercises the failure branches a QA engineer must see surfaced with
 * meaningful messages:
 *   - invalid verification token → "Expired or invalid link" panel,
 *   - login with wrong credentials → generic 401 message,
 *   - login for an unverified account → 403 reveals the "Resend email" block.
 *
 * NOT EXECUTED during authoring (no browsers in the sandbox). Run via
 * `npm run test:e2e`.
 */
import { expect, test } from "@playwright/test";

test("tampered verification token shows the expired/invalid panel", async ({
  page,
}) => {
  await page.goto("/verify?token=this-token-does-not-exist");
  await expect(
    page.getByRole("heading", { name: /expired or invalid link/i }),
  ).toBeVisible();
  // The panel offers a resend action.
  await expect(
    page.getByRole("button", { name: /resend email/i }),
  ).toBeVisible();
});

test("login with unknown credentials shows a generic error", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: /log in/i }).click();

  await expect(page.getByRole("alert")).toContainText(
    /incorrect email or password/i,
  );
  // Still on the login screen (no redirect on failure).
  await expect(page).toHaveURL(/\/login/);
});

test("login for an unverified account reveals the resend block (403)", async ({
  page,
}) => {
  // Sign up a fresh account but never verify it.
  const email = `unverified+${Date.now()}@example.com`;
  const password = "another correct password";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByRole("status")).toContainText(/verification link/i);

  // Attempt to log in without verifying → 403 → resend block appears.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /log in/i }).click();

  await expect(
    page.getByRole("region", { name: /resend verification/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /resend email/i }),
  ).toBeVisible();
});
