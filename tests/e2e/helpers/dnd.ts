/**
 * dnd-kit-friendly drag helper for Playwright E2E.
 *
 * The board uses `@dnd-kit` with a PointerSensor whose activation constraint is
 * a 4px move (see src/ui/board/BoardScreen.tsx). Playwright's one-shot
 * `locator.dragTo()` can miss that threshold, so this helper performs an
 * explicit press → small nudge → move-to-target → release sequence with a few
 * intermediate steps. The card's drag handle (`aria-label="Move ticket: …"`) is
 * the grabbable element.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Drag the card titled `ticketTitle` onto the droppable identified by
 * `targetList` (a column's `role="list"` locator).
 */
export async function dragTicketToColumn(
  page: Page,
  ticketTitle: string,
  targetList: Locator,
): Promise<void> {
  const handle = page.getByRole("button", {
    name: `Move ticket: ${ticketTitle}`,
  });
  await expect(handle).toBeVisible();

  const from = await handle.boundingBox();
  const to = await targetList.boundingBox();
  if (!from || !to) {
    throw new Error("Could not resolve drag source/target bounding boxes.");
  }

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + Math.min(40, to.height / 2);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Cross the 4px activation threshold first.
  await page.mouse.move(startX + 8, startY + 8, { steps: 2 });
  // Then travel to the target column in several steps so dnd-kit tracks it.
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}
