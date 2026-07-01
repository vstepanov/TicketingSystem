/**
 * Shared E2E journey helpers.
 *
 * `signUpVerifyAndLogin` walks a brand-new account from signup through the
 * emailed verification link to a logged-in board — the precondition most specs
 * need. It reuses the SMTP capture mailbox to recover the raw token, exactly as
 * the full-journey spec documents.
 */
import { expect, type Page } from "@playwright/test";

import { waitForVerificationLink } from "./mailbox";
import { readRuntime } from "./runtime";

export interface Account {
  email: string;
  password: string;
}

/** Create a unique unverified account via the signup UI (no verification). */
export async function signUp(page: Page): Promise<Account> {
  const email = `qa+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByRole("status")).toContainText(/verification link/i);

  return { email, password };
}

/** Sign up, verify via the emailed token, and log in. Leaves page on /board. */
export async function signUpVerifyAndLogin(page: Page): Promise<Account> {
  const account = await signUp(page);
  const runtime = await readRuntime();

  const link = await waitForVerificationLink(runtime.mailboxFile, account.email);
  const url = new URL(link);
  await page.goto(`${url.pathname}${url.search}`);
  await expect(
    page.getByRole("heading", { name: /email verified/i }),
  ).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/board/);

  return account;
}

/** Create a team via the Teams UI and return its name. */
export async function createTeam(page: Page): Promise<string> {
  const name = `Team ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/teams");
  await page.getByRole("button", { name: /\+ create team/i }).click();
  await page.getByLabel("Team name").fill(name);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("cell", { name })).toBeVisible();
  return name;
}

/** Create a ticket (defaults to state "new") for the given team via the UI. */
export async function createTicket(
  page: Page,
  teamName: string,
  title: string,
): Promise<void> {
  await page.goto("/board");
  await page.getByLabel("Team").selectOption({ label: teamName });
  await page.getByRole("link", { name: /\+ new ticket/i }).click();
  await expect(page).toHaveURL(/\/tickets\/new/);
  await page.getByLabel("Team").selectOption({ label: teamName });
  await page.getByLabel("Type").selectOption("bug");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Body").fill(`Body for ${title}`);
  await page.getByRole("button", { name: /^create$/i }).click();
}
