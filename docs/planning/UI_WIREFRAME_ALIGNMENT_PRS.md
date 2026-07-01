# UI Wireframe Alignment — Pull Request descriptions

Ready-to-paste PR titles and bodies for the six phase branches produced from
`docs/planning/UI_WIREFRAME_ALIGNMENT_PLAN.md`. All six branches are local and
**unpushed**.

## Important: branches are dependent — push & merge in phase order (00 → 05)

Each phase branch was cut from `main` **after** the previous phase merged, so a
branch contains its own commit on top of all earlier phases. Two clean options:

**Option A — stacked PRs (cleanest per-phase diffs).** Set each PR's base branch
to the previous phase branch:

- PR 0 base `main` ← `feature/ui-wireframe-alignment-phase-00`
- PR 1 base `feature/ui-wireframe-alignment-phase-00` ← `…-phase-01`
- PR 2 base `…-phase-01` ← `…-phase-02`
- PR 3 base `…-phase-02` ← `…-phase-03`
- PR 4 base `…-phase-03` ← `…-phase-04`
- PR 5 base `…-phase-04` ← `…-phase-05`

Merge them bottom-up; each PR shows only its own phase's diff.

**Option B — all against `main`, merged in order.** Point every PR at `main` and
merge 00 first, then 01, … Each PR's diff shrinks to just its phase once the
earlier one lands.

Push everything:

```bash
for b in 00 01 02 03 04 05; do
  git push -u origin feature/ui-wireframe-alignment-phase-$b
done
```

> Screenshots: this work was implemented and checked in a headless environment,
> so no browser screenshots were captured. Each PR notes where a visual overlay
> against the mockup is the recommended reviewer check. Run `npm run dev` and
> compare against `docs/01-architecture/wireframes/`.

> Checks legend (run per phase): `npx tsc --noEmit` ✅ · `npm run lint` ✅ (only
> 2 pre-existing warnings in `scripts/migrate.ts`, unrelated) · vitest component
> suite **44/44** ✅. A full `next build` was not run in-environment (exceeds the
> sandbox command-time limit) — recommend it in CI.

---

## PR 0 — Wave 0

**Title:** `refactor(ui): consolidate time helpers and extend Table primitives (wireframe alignment phase 0)`

**Body:**

### Phase
Wave 0 — Shared design-system fixes (`docs/planning/UI_WIREFRAME_ALIGNMENT_PLAN.md`).

### Summary
Foundational, no-visible-change groundwork reused by later phases:
- Add `src/ui/format-time.ts` with three pure UTC-safe formatters: `formatCompactUtc` (`YYYY-MM-DD HH:MM UTC`, preserves current output), `formatRelative` (`2h ago` / `Yesterday` / `Jun 20`), `formatMonthDayUtc` (`Jun 22, 09:15 UTC`).
- Remove the four duplicated `formatUtc` helpers (`board/TicketCard`, `teams/TeamRow`, `epics/EpicRow`, `tickets/use-ticket`); `use-ticket` now re-exports `formatCompactUtc as formatUtc` so `TicketDetailScreen`/`CommentsPanel` imports keep working.
- `src/ui/Table.tsx`: drop the uppercase header transform (mockups use title-case) and add an optional `align` prop to `Td`/`Th` (defaults to left; not yet applied).

### Files changed (7)
`src/ui/format-time.ts` (new), `src/ui/Table.tsx`, `src/ui/board/TicketCard.tsx`, `src/ui/epics/EpicRow.tsx`, `src/ui/teams/TeamRow.tsx`, `src/ui/tickets/use-ticket.ts`, `docs/planning/UI_WIREFRAME_ALIGNMENT_PLAN.md`.

### Tests / checks
`tsc --noEmit` ✅ · `eslint` ✅ · vitest component suite 44/44 ✅. No visible output changed, so no test updates were needed.

### Screenshots
None — no visible change.

### Assumptions
`formatRelative`/`formatMonthDayUtc` are intentionally unused here; later phases wire them. `Pill` and design tokens already matched the mockups (no change).

### Follow-ups
None.

---

## PR 1 — Wave 1

**Title:** `feat(board): align Kanban board with wireframe (phase 1)`

**Body:**

### Phase
Wave 1 — Kanban Board (`01-kanban-board.png`).

### Summary
- Make the **whole ticket card** the drag source and remove the visible `⠿` handle (not in the mockup). Keyboard DnD is preserved via dnd-kit `attributes`/`listeners` on the card (supplies `role="button"` + `tabIndex`), plus `aria-label="Move ticket: {title}"`. The title stays a `<Link>`; the 4px pointer activation distance keeps plain clicks navigating to the detail page.
- Card timestamp now uses `formatRelative` and is positioned bottom-right.
- More vertical breathing room on cards (padding/gap bump).
- Rename the search filter label to **"Search"** (placeholder `Search title…` unchanged).
- Header/nav, controls row and column headers already matched the mockup (verified, no change).

### Files changed (4)
`src/ui/board/TicketCard.tsx`, `src/ui/board/FilterBar.tsx`, `tests/component/board.test.tsx`, `docs/planning/UI_WIREFRAME_ALIGNMENT_PLAN.md`.

### Tests / checks
`tsc --noEmit` ✅ · `eslint` ✅ · vitest component suite 44/44 ✅. `board.test.tsx` updated to query the renamed "Search" label; drag/move logic is tested through `performOptimisticMove`.

### Screenshots
Recommend a visual overlay against `01-kanban-board.png` (card height/padding, bottom-right timestamp).

### Assumptions
Full-card drag source relies on dnd-kit's `attributes` for keyboard operability; a separate visible handle is unnecessary.

### Follow-ups
Confirm click-vs-drag feel in a real browser (4px threshold should keep navigation intact).

---

## PR 2 — Wave 2

**Title:** `feat(auth): align login/signup/verify with wireframe (phase 2)`

**Body:**

### Phase
Wave 2 — Auth flow (`02-auth-flow.png`).

### Summary
- Remove the "TICKET TRACKER" eyebrow from `AuthCard` (not in the mockup); cards now start at the title. The authenticated shell's brand (`Header.tsx`) is untouched.
- Verify-success screen shows a large **circular checkmark** graphic (64px gray circle, dark ✓, `aria-hidden`) above "Email verified"; the accessible `role="status"` message is retained.
- Login "not verified" block restyled: centered muted "Account not verified?" caption above a **full-width outlined "Resend email"** button (dropped the bordered box); resend/429 behavior unchanged.
- "Continue to login" renders full-width.
- Copy, labels and footer links already matched (verified, no change).

### Files changed (4)
`src/ui/AuthCard.tsx`, `app/verify/verify-result.tsx`, `app/login/page.tsx`, `docs/planning/UI_WIREFRAME_ALIGNMENT_PLAN.md`.

### Tests / checks
`tsc --noEmit` ✅ · `eslint` ✅ · vitest component suite 44/44 ✅ (auth suites: login/signup/verify). `app-shell.test.tsx` asserts the brand via `Header`, so eyebrow removal doesn't affect it.

### Screenshots
Recommend overlays of all three cards against `02-auth-flow.png` (title top-spacing, checkmark circle).

### Assumptions
Checkmark uses a literal `32px` glyph since no token larger than `--text-xl` (20px) exists.

### Follow-ups
None.

---

## PR 3 — Wave 3

**Title:** `feat(tickets): align ticket detail screen with wireframe (phase 3)`

**Body:**

### Phase
Wave 3 — Ticket details (`03-ticket-details.png`).

### Summary
- Back link now reads **"← Back to {team name}"** (resolved from the loaded teams list via `ticket.teamId`) and links to `/board?teamId=…`; falls back to "Back to board" if the name is unavailable.
- Meta line wrapped in a subtle gray bar; Created/Modified use `formatMonthDayUtc` (`Jun 22, 09:15 UTC`).
- Larger, bolder ticket title (28px).
- `TicketForm` reflowed: **row 1 = Team · Type · State** (3 columns), then Epic full-width, then Title, then Body. All behavior preserved (team-change-clears-epic, disabled/loading, per-field errors).
- Comment cards get a light-gray fill; "Post comment" aligned bottom-right.
- Header Delete/Save already top-right (verified).

### Files changed (5)
`src/ui/tickets/TicketDetailScreen.tsx`, `src/ui/tickets/TicketForm.tsx`, `src/ui/tickets/CommentsPanel.tsx`, `tests/component/tickets.test.tsx`, `docs/planning/UI_WIREFRAME_ALIGNMENT_PLAN.md`.

### Tests / checks
`tsc --noEmit` ✅ · `eslint` ✅ · vitest component suite 44/44 ✅. `tickets.test.tsx` updated for the new meta timestamp format.

### Screenshots
Recommend overlay against `03-ticket-details.png` (28px title, gray meta bar, 3-column form row).

### Assumptions
The detail payload has no team name, so it's resolved from the teams query. The mockup's "Payments Team"/"TCK-1042" are sample data; the app shows the real team name and a `TCK-{uuid-prefix}` id.

### Follow-ups
If a human-readable sequential ticket id is desired, that's a separate change (documented in the plan's open decisions).

---

## PR 4 — Wave 4

**Title:** `feat(teams): align team management table with wireframe (phase 4)`

**Body:**

### Phase
Wave 4 — Team management (`04-team-management.png`).

### Summary
- Render Tickets/Epics as plain **centered numbers** (removed the count pills); matching headers centered via `Th align="center"`.
- Modified column uses relative time (`formatRelative`): "Today 12:40" / "Yesterday" / "Jun 20".
- Create-team field gains placeholder "e.g. Platform Engineering".
- Header, title-case headers, disabled-Delete state and the helper line already matched (verified).

### Files changed (4)
`src/ui/teams/TeamRow.tsx`, `src/ui/teams/TeamsScreen.tsx`, `src/ui/teams/CreateTeamPanel.tsx`, `docs/planning/UI_WIREFRAME_ALIGNMENT_PLAN.md`.

### Tests / checks
`tsc --noEmit` ✅ · `eslint` ✅ · vitest component suite 44/44 ✅ (`teams.test.tsx` count assertions hold with plain numbers; Modified cell not asserted).

### Screenshots
Recommend overlay against `04-team-management.png` (centered numeric columns, relative Modified).

### Assumptions
`formatRelative` renders "Today HH:MM" where the mockup shows bare "Today" — accepted per the plan for consistency with other screens.

### Follow-ups
None.

---

## PR 5 — Wave 5

**Title:** `feat(epics): align epic management screen with wireframe (phase 5)`

**Body:**

### Phase
Wave 5 — Epic management (`05-epic-management.png`).

### Summary
- Header reflow: "Epics" title + black "+ Create epic" on the top row; the labelled **Team select sits beneath the title** on the left (previously grouped on the right).
- Delete action is now a small **square "×" icon button** (outlined, grayed when tickets reference the epic, `aria-label="Delete epic"`, disabled tooltip kept). Edit stays a text button.
- Tickets rendered as a plain **centered number** (pill removed) with a centered header; Modified uses `formatRelative`.
- Edit-epic panel buttons ordered **Cancel (outline) · Save (black)**, bottom-right.
- Title-case headers, description subtitle and helper line already matched (verified).

### Files changed (5)
`src/ui/epics/EpicsScreen.tsx`, `src/ui/epics/EpicRow.tsx`, `src/ui/epics/EditEpicPanel.tsx`, `tests/component/epics.test.tsx`, `docs/planning/UI_WIREFRAME_ALIGNMENT_PLAN.md`.

### Tests / checks
`tsc --noEmit` ✅ · `eslint` ✅ · vitest component suite 44/44 ✅. `epics.test.tsx` in-row delete queries updated to the new accessible name "Delete epic" (the confirm-dialog "Delete" button is unchanged).

### Screenshots
Recommend overlay against `05-epic-management.png` (header layout, "×" delete button, centered Tickets).

### Assumptions
`×` delete button sized at 34px square to match the shared Button height.

### Follow-ups
None.
