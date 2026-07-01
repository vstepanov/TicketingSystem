# UI ↔ Wireframe Alignment Plan

Goal: bring every application view to pixel-parity with its mockup in
`docs/01-architecture/wireframes/`. Work is organized into **waves**; each wave
has trackable **steps** with an explicit status so we always know what is
implemented vs pending.

## How to track progress

Each step has a status box — update it as you go:

- `[ ]` pending
- `[~]` in progress
- `[x]` done
- `[!]` blocked / needs decision

Also update the **Wave status** table below when a wave changes state. Keep the
"Last updated" line current.

**Last updated:** 2026-07-01 · **Overall:** all waves complete (6 of 6, incl. Wave 0)

### Wave status

| Wave | View | Mockup | Status | Notes |
|------|------|--------|--------|-------|
| 0 | Shared design-system fixes | (all) | `[x]` done | Consolidated time helpers + Table capabilities; no visible change |
| 1 | Kanban Board | `01-kanban-board.png` | `[x]` done | Whole card is now the drag source (no visible handle); relative bottom-right timestamp; Search label; taller cards. Header/nav/columns/controls already matched. |
| 2 | Auth flow (login / signup / verify) | `02-auth-flow.png` | `[x]` done | Removed "TICKET TRACKER" eyebrow from AuthCard; circular checkmark on verify success; centered "Account not verified?" + full-width outlined Resend on login; full-width "Continue to login". Copy/labels/links already matched. |
| 3 | Ticket details | `03-ticket-details.png` | `[x]` done | Back link → "← Back to {team name}" (resolved from teams list) linking `/board?teamId=…`; meta line in a gray bar with month-name UTC timestamps; larger 28px bold title; form row1 = Team·Type·State (3-col) with Epic full-width below; comment cards gray-filled; Post comment bottom-right. Header Delete/Save already top-right. |
| 4 | Team management | `04-team-management.png` | `[x]` done | Tickets/Epics now plain centered numbers (pills removed) with centered headers; Modified uses relative time (`formatRelative`); Create-team field gains placeholder "e.g. Platform Engineering". Header, title-case headers, disabled-Delete + helper line already matched. |
| 5 | Epic management | `05-epic-management.png` | `[x]` done | Header re-laid out (title + black "+ Create epic" on top row, Team select beneath the title on the left); delete is now a small square "×" icon button (grayed when referenced, `aria-label="Delete epic"`); Tickets is a plain centered number (Pill removed) with centered header; Modified uses `formatRelative`; Edit panel buttons ordered Cancel (outline) · Save (black) bottom-right. Headers, subtitle, helper line already matched. |

### Verification checklist (run at the end of each wave)

- `[ ]` `npm run lint` passes
- `[ ]` `npm run test:unit` passes (update component tests for changed markup)
- `[ ]` Visual diff: screenshot the view and overlay against the mockup
- `[ ]` Keyboard / a11y still works (focus rings, drag handle, `aria-*`)

---

## Wave 0 — Shared design-system fixes

These are reused across views; fixing them once removes duplicated deviations.
Files: `app/globals.css`, `src/ui/Table.tsx`, `src/ui/Pill.tsx`, plus the three
duplicated `formatUtc` helpers.

- `[x]` **0.1 Shared time helper.** Created `src/ui/format-time.ts` exporting
  three pure functions: `formatCompactUtc` (`YYYY-MM-DD HH:MM UTC`, preserves the
  previous visible output), `formatRelative` ("2h ago"/"Yesterday"/"Jun 20", for
  later waves) and `formatMonthDayUtc` (`Mon D, HH:MM UTC`, ticket meta line, for
  a later wave). Deleted the duplicated local `formatUtc` copies in
  `TicketCard.tsx`, `teams/TeamRow.tsx`, `epics/EpicRow.tsx` and the exported one
  in `tickets/use-ticket.ts` (now re-exports `formatCompactUtc as formatUtc` so
  `TicketDetailScreen`/`CommentsPanel` imports keep working). No visible change —
  `formatRelative`/`formatMonthDayUtc` are wired by later waves.
- `[x]` **0.2 Table header casing.** Removed `textTransform: "uppercase"` from
  `Table.tsx` `TH_STYLE`; weight/color/letter-spacing kept. Headers now render
  title-case as authored.
- `[x]` **0.3 Numeric cell alignment.** Added an optional
  `align?: "left" | "center" | "right"` prop to both `Td` and `Th` in
  `Table.tsx` (defaults to left). Capability only — not yet applied to any
  column (that happens in later waves).
- `[!]` **0.4 Pill / count chip.** No change needed — `Pill.tsx` is already a
  rounded gray chip (`borderRadius: 999px`, `--color-surface-muted`). Fine-tuning
  of chip size deferred to the board wave if the mockup overlay shows a delta.
- `[!]` **0.5 Confirm token parity.** No change needed — spot-checked
  `globals.css` radius (`4/6/10px`), spacing (`4→32px`) and shadow tokens; all
  sensible and consistent with the mockups.

---

## Wave 1 — Kanban Board (`01-kanban-board.png`)

Files: `src/ui/board/BoardScreen.tsx`, `FilterBar.tsx`, `BoardColumn.tsx`,
`TicketCard.tsx`, `src/ui/Header.tsx`, `src/ui/NavTabs.tsx`.

- `[x]` **1.1 Card drag handle.** Removed the visible `⠿` handle button. The whole
  card container is now the drag source — dnd-kit `attributes`/`listeners` are
  spread onto it (dnd-kit supplies `role="button"` + `tabIndex=0` for keyboard
  DnD) and a meaningful `aria-label="Move ticket: {title}"` is set after the
  spread. Title stays a `<Link>`; the PointerSensor's 4px activation distance
  keeps plain clicks navigating to the detail page. Board test updated (queries
  Search by its new label) and green.
- `[x]` **1.2 Card timestamp.** Swapped `formatCompactUtc` → `formatRelative`
  ("2h ago"/"Yesterday"/…) and positioned it bottom-right via a dedicated
  `TIMESTAMP_STYLE` (`alignSelf: flex-end`, right-aligned).
- `[x]` **1.3 Card badge row.** With the handle gone the type badge sits alone at
  the top of the card. Confirmed pill styling matches (uppercase, `--color-surface-muted`
  fill, `borderRadius: 999px`).
- `[x]` **1.4 Card spacing/height.** Bumped card `padding` `--space-3`→`--space-4`
  and inter-row `gap` `--space-2`→`--space-3` for more vertical breathing room.
- `[x]` **1.5 Filter labels.** Changed the search field `label` from
  "Search title" → "Search" (placeholder "Search title…" kept). "Type"/"Epic"
  already correct.
- `[!]` **1.6 Controls row.** No change needed — Team select (left, labelled) +
  black "+ New ticket" (right) already sit in a flex header row above the filter
  card, matching the mockup.
- `[!]` **1.7 Column header.** No change needed — uppercase labels + right-aligned
  count `Pill` and canonical `BOARD_COLUMN_ORDER` already match.
- `[!]` **1.8 Header/nav.** No change needed — brand "TICKET TRACKER" (bold, left),
  centered `NavTabs` with active gray fill (`--color-surface-muted`), and
  right-aligned `UserMenu` already match.

---

## Wave 2 — Auth flow (`02-auth-flow.png`)

The mockup shows three reference cards (Log in / Create account / Email
verification). Files: `app/login/page.tsx`, `app/signup/page.tsx`,
`app/verify/verify-result.tsx`, `src/ui/AuthCard.tsx`.

- `[x]` **2.1 Brand line.** Removed the "TICKET TRACKER" eyebrow (`<div>` +
  `BRAND_STYLE`) from `AuthCard.tsx` so the card now starts at the title, matching
  the mockup. Title/subtitle spacing unchanged (title `margin:0`, subtitle keeps
  its `--space-1`/`--space-5` margins). The authenticated shell's brand
  (`Header.tsx`) is untouched — `app-shell.test.tsx` still finds it.
- `[x]` **2.2 Verify success icon.** `verify-result.tsx` success state now renders
  a centered 64px circular graphic (`--color-surface-muted` fill, dark 32px ✓,
  `aria-hidden="true"`) above the "Email verified" heading; the inline "✓ " text
  in the `role="status"` line was removed while keeping the status message.
- `[x]` **2.3 Login "not verified" block.** Replaced the bordered gray box with
  centered muted text "Account not verified?" directly above a full-width outlined
  "Resend email" button, still inside `role="region"` with its label. Behavior
  (resend POST, 429 handling, `resendMessage`) unchanged.
- `[x]` **2.4 Button width.** "Continue to login" is now full-width — the wrapping
  `Link` is `display:block` and the `Button` has `width:100%`. Login/signup submit
  buttons already stretch as flex-column children (verified, no change).
- `[!]` **2.5 Copy/labels.** Already matched — verified "Log in" / "Use your
  verified account.", "Create account" / "Email verification is required." with
  placeholder "Minimum 8 characters", "Email verified" / "Your account is ready to
  use.", and error "Expired or invalid link". No changes. (Signup post-submit
  "Check your email" state left intact per plan.)
- `[!]` **2.6 Links.** Already matched — "Create an account →" (login) and
  "Already registered? Log in →" (signup) placement/weight correct. No changes.

---

## Wave 3 — Ticket details (`03-ticket-details.png`)

Files: `src/ui/tickets/TicketDetailScreen.tsx`, `TicketForm.tsx`,
`CommentsPanel.tsx`.

- `[x]` **3.1 Back link label.** The back link now reads "← Back to {team name}"
  (resolved from the loaded teams list by `ticket.teamId`, since the ticket detail
  payload has no team name) and links to `/board?teamId={ticket.teamId}`. Falls
  back to "← Back to board" when no name is available. Restyled bold
  (`fontWeight: 600`, `--color-text`).
- `[x]` **3.2 Meta line box.** The meta line moved out of the header block to its
  own `<p>` between the back link and the title, wrapped in a subtle gray bar
  (`--color-surface-muted` background, `--space-2`/`--space-3` padding,
  `--radius-md`). Same meta text composition (adds `Epic: …` when set).
- `[x]` **3.3 Timestamp format.** Created/Modified in the meta line now use
  `formatMonthDayUtc` → "Jan 2, 12:30 UTC" (imported from `@/ui/format-time`).
  Comment timestamps left on the compact `formatUtc` (out of scope).
- `[x]` **3.4 Title size.** Ticket title bumped from `--text-xl` (20px) to a literal
  `28px` at `fontWeight: 700` (no larger token exists — px is intentional).
- `[x]` **3.5 Form field layout.** `ROW_STYLE` changed to a 3-column grid holding
  **Team · Type · State**; **Epic (optional)** is now a full-width Select below the
  row, then Title, then Body. All behavior preserved (team-change-clears-epic,
  disabled/loading states, per-field errors, labels, option lists).
- `[x]` **3.6 Comments panel.** Comment cards now use a light-gray fill
  (`--color-surface-muted`, border removed) keeping the bold author + right-aligned
  muted time header and the body.
- `[x]` **3.7 Post-comment button.** Wrapped the submit button in a flex row with
  `justifyContent: flex-end` so "Post comment" sits at the panel's bottom-right.
- `[!]` **3.8 Header actions.** No change needed — Delete (secondary/outlined) +
  Save (primary/black) already sit top-right in `ACTIONS_STYLE`.

---

## Wave 4 — Team management (`04-team-management.png`)

Files: `src/ui/teams/TeamsScreen.tsx`, `TeamRow.tsx`, `CreateTeamPanel.tsx`.

- `[!]` **4.1 Header.** Already matched — large "Teams" title + caption "All
  verified users can view and manage all teams." + black "+ Create team" button
  sit in the top-right header row. No change.
- `[!]` **4.2 Table headers.** Already matched — after Wave 0.2 removed the global
  uppercase, the screen's authored literals ("Name", "Tickets", "Epics",
  "Modified", "Actions") render title-case. No change.
- `[x]` **4.3 Count columns.** Removed the `<Pill>` wrappers around
  `team.ticketCount` / `team.epicCount` in `TeamRow.tsx`, rendering plain numbers
  in `Td align="center"`; the matching `Th align="center"` was added in
  `TeamsScreen.tsx` so headers and data align.
- `[x]` **4.4 Modified column.** Swapped `formatCompactUtc` → `formatRelative`
  (imported from `@/ui/format-time`) so Modified renders "Today HH:MM" /
  "Yesterday" / "Jun 20".
- `[!]` **4.5 Delete disabled state.** Already matched — the secondary `Button`
  dims when `disabled` (canDelete === false) with the explanatory `title`, and the
  helper line "Delete is disabled while a team contains tickets or epics." is
  rendered below the table. No change.
- `[x]` **4.6 Create-team panel.** The create form is now a centered **modal
  popup** (rendered via the shared `Dialog`, which supplies the card, the
  "Create team" heading and a focus trap), matching the floating card in the
  mockup. `CreateTeamPanel` is chromeless (Team-name field + black "Create"
  button, placeholder "e.g. Platform Engineering"); the "+ Create team" button
  opens it, Escape/backdrop/success closes it. Behavior (create mutation,
  validation, onDone) preserved.

---

## Wave 5 — Epic management (`05-epic-management.png`)

Files: `src/ui/epics/EpicsScreen.tsx`, `EpicRow.tsx`, `EditEpicPanel.tsx`,
`CreateEpicPanel.tsx`.

- `[x]` **5.1 Header layout.** Re-laid out `EpicsScreen.tsx`: the "Epics" title and
  the black "+ Create epic" button now share a top `TITLE_ROW_STYLE` flex row
  (title left, button right); the labelled **Team** select moved BENEATH the title
  on the left (`CONTROLS_STYLE` with `marginTop`). All behavior preserved (URL
  team sync via `selectTeam`, Create toggle disabled when no team).
- `[x]` **5.2 Delete action = "×" icon.** In `EpicRow.tsx` the delete action is now a
  small 34px-square outlined `Button` showing "×" (`DELETE_BUTTON_STYLE`), grayed
  when `!epic.canDelete` (Button's disabled styling), with `aria-label="Delete
  epic"` and the disabled `title` hint kept. Edit stays an outlined text button;
  `onRequestDelete`/ConfirmDialog flow unchanged.
- `[!]` **5.3 Table headers.** Already matched — screen authors title-case literals
  ("Title", "Tickets", "Modified", "Actions"); global uppercase removed in 0.2.
  No change beyond adding `align="center"` to the Tickets header (see 5.4).
- `[x]` **5.4 Count / modified columns.** `EpicRow.tsx` renders `epic.ticketCount`
  as a plain number in `Td align="center"` (Pill removed) with the matching
  `Th align="center"` in `EpicsScreen.tsx`; Modified swapped
  `formatCompactUtc` → `formatRelative`.
- `[!]` **5.5 Row subtitle.** Already matched — muted `DESCRIPTION_STYLE` line renders
  `epic.description` (single-line, ellipsis, `--text-sm`, muted) under the title.
  No change.
- `[x]` **5.6 Edit-epic panel.** `EditEpicPanel.tsx` heading/labels/fields already
  matched; reordered the footer buttons to Cancel (outline) · Save (black) and
  added `justifyContent: flex-end` so they sit bottom-right per the mockup.
- `[!]` **5.7 Helper line.** Already matched — "Delete is disabled while tickets
  reference the epic." rendered below the table (`HELPER_STYLE`). No change.

---

## Notes & open decisions

- **Relative vs absolute time:** mockups favor relative time everywhere except the
  ticket meta line (absolute month-name UTC). Confirm this split is acceptable, or
  standardize.
- **Sample data mismatch (`TCK-1042`):** the mockup shows a numeric ticket id;
  the app derives `TCK-{first 8 uuid chars}`. Cosmetic only — no change unless a
  human-readable sequence id is desired.
- **Drag handle (1.1)** is the one place where mockup fidelity and keyboard
  accessibility can conflict — resolve before implementing.
