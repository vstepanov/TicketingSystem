/**
 * Focused E2E: board drag-and-drop failure rollback (plan §5.7, §2.8, §6.2).
 *
 * Explicit requirement: when the state PATCH fails, the card must RETURN to its
 * previous column and an error toast must be shown. We force the failure by
 * intercepting `PATCH /api/tickets/{id}/state` with a 500 via Playwright routing,
 * then assert the card snaps back to NEW and the error toast appears.
 *
 * NOT EXECUTED during authoring (no browsers in the sandbox). Run via
 * `npm run test:e2e`.
 */
import { expect, test } from "@playwright/test";

import { dragTicketToColumn } from "./helpers/dnd";
import { createTeam, createTicket, signUpVerifyAndLogin } from "./helpers/journey";

const TICKET_TITLE = "Rollback candidate";

test("a failed state PATCH returns the card to its original column", async ({
  page,
}) => {
  await signUpVerifyAndLogin(page);
  const team = await createTeam(page);
  await createTicket(page, team, TICKET_TITLE);

  const newColumn = page.getByRole("region", { name: /^New column$/i });
  // Reload the board until the just-created card is present. A single board fetch
  // is cached for staleTime (30s) and won't re-fetch on its own, so if the very
  // first fetch races the create's commit the card would never appear within a
  // plain 5s assertion. Re-navigating forces a fresh fetch until it shows.
  await expect(async () => {
    await page.goto("/board");
    await page.getByLabel("Team").selectOption({ label: team });
    await expect(newColumn.getByText(TICKET_TITLE)).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 20_000 });

  // Force every state update to fail.
  await page.route("**/api/tickets/*/state", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "INTERNAL", message: "boom" },
      }),
    }),
  );

  const doneList = page.getByRole("list", { name: /^Done,/i });
  await dragTicketToColumn(page, TICKET_TITLE, doneList);

  // Error toast is shown (explicit requirement).
  await expect(page.getByText(/could not move the ticket/i)).toBeVisible();

  // Card is back in NEW and NOT in Done.
  await expect(newColumn.getByText(TICKET_TITLE)).toBeVisible();
  await expect(
    page.getByRole("region", { name: /^Done column$/i }).getByText(TICKET_TITLE),
  ).toHaveCount(0);
});
