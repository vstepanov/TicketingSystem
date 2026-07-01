/**
 * Full-journey E2E (plan §6, S20 DoD): the complete happy path a QA engineer
 * would walk, proving the whole stack works end to end against a real browser,
 * the real built app, a real ephemeral Postgres, and a real (captured) email:
 *
 *   signup → verify (via emailed token) → login → create team → create epic →
 *   create ticket → drag the ticket across board columns → refresh → confirm
 *   the move persisted.
 *
 * TOKEN HANDLING (documented approach): the raw verification token only ever
 * exists in the emailed link — the DB stores just its hash — so we recover it
 * from the SMTP capture server's mailbox file (see helpers/mailbox.ts), exactly
 * as a real user reads it from their inbox. No production/test backdoor.
 *
 * NOT EXECUTED during authoring (no browsers in the sandbox). Run via
 * `npm run test:e2e`.
 */
import { expect, test } from "@playwright/test";

import { dragTicketToColumn } from "./helpers/dnd";
import { waitForVerificationLink } from "./helpers/mailbox";
import { readRuntime } from "./helpers/runtime";

// A unique email per run keeps the (persistent-per-run) DB free of collisions.
const EMAIL = `qa+${Date.now()}@example.com`;
const PASSWORD = "correct horse battery staple";
const TEAM_NAME = `Payments ${Date.now()}`;
const EPIC_TITLE = "Checkout revamp";
const TICKET_TITLE = "Card form validation";
const TICKET_BODY = "Validate card number, expiry and CVC before submit.";

test("signup → verify → login → team → epic → ticket → drag → refresh", async ({
  page,
}) => {
  const runtime = await readRuntime();

  // --- 1. Sign up ----------------------------------------------------------
  await page.goto("/signup");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign up/i }).click();

  // Success panel — no auto-login (plan §4.2 / §5.4).
  await expect(page.getByRole("status")).toContainText(/verification link/i);

  // --- 2. Verify via the emailed token ------------------------------------
  const verifyLink = await waitForVerificationLink(runtime.mailboxFile, EMAIL);
  // Navigate using only the path+query so Playwright's baseURL is honoured even
  // if the emailed APP_URL host differs from the test host.
  const url = new URL(verifyLink);
  await page.goto(`${url.pathname}${url.search}`);
  await expect(
    page.getByRole("heading", { name: /email verified/i }),
  ).toBeVisible();

  // --- 3. Log in -----------------------------------------------------------
  await page.getByRole("link", { name: /continue to login/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();

  // Authenticated shell renders; nav is visible.
  await expect(page).toHaveURL(/\/board/);
  await expect(page.getByRole("link", { name: /^board$/i })).toBeVisible();

  // --- 4. Create a team ----------------------------------------------------
  await page.getByRole("link", { name: /^teams$/i }).click();
  await expect(page).toHaveURL(/\/teams/);
  await page.getByRole("button", { name: /\+ create team/i }).click();
  await page.getByLabel("Team name").fill(TEAM_NAME);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("cell", { name: TEAM_NAME })).toBeVisible();

  // --- 5. Create an epic for that team ------------------------------------
  await page.getByRole("link", { name: /^epics$/i }).click();
  await expect(page).toHaveURL(/\/epics/);
  await page.getByLabel("Team").selectOption({ label: TEAM_NAME });
  await page.getByRole("button", { name: /\+ create epic/i }).click();
  await page.getByLabel("Title").fill(EPIC_TITLE);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("cell", { name: EPIC_TITLE })).toBeVisible();

  // --- 6. Create a ticket --------------------------------------------------
  await page.getByRole("link", { name: /^board$/i }).click();
  await page.getByLabel("Team").selectOption({ label: TEAM_NAME });
  await page.getByRole("link", { name: /\+ new ticket/i }).click();
  await expect(page).toHaveURL(/\/tickets\/new/);

  await page.getByLabel("Team").selectOption({ label: TEAM_NAME });
  await page.getByLabel("Type").selectOption("feature");
  // New tickets default to state "new" — leave the State select untouched.
  await page.getByLabel("Title").fill(TICKET_TITLE);
  await page.getByLabel("Body").fill(TICKET_BODY);
  await page.getByRole("button", { name: /^create$/i }).click();

  // Back on the board (or ticket detail) — return to the board to drag.
  await page.getByRole("link", { name: /^board$/i }).click();
  await page.getByLabel("Team").selectOption({ label: TEAM_NAME });

  // The new ticket starts in the NEW column.
  const newColumn = page.getByRole("region", { name: /^New column$/i });
  await expect(newColumn.getByText(TICKET_TITLE)).toBeVisible();

  // --- 7. Drag the ticket New → In Progress -------------------------------
  const inProgressList = page.getByRole("list", {
    name: /^In Progress,/i,
  });
  await dragTicketToColumn(page, TICKET_TITLE, inProgressList);

  // Optimistic move lands the card in In Progress.
  const inProgressColumn = page.getByRole("region", {
    name: /^In Progress column$/i,
  });
  await expect(inProgressColumn.getByText(TICKET_TITLE)).toBeVisible();

  // --- 8. Refresh and confirm persistence ---------------------------------
  await page.reload();
  await page.getByLabel("Team").selectOption({ label: TEAM_NAME });
  await expect(
    page.getByRole("region", { name: /^In Progress column$/i }).getByText(
      TICKET_TITLE,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /^New column$/i }).getByText(TICKET_TITLE),
  ).toHaveCount(0);
});
