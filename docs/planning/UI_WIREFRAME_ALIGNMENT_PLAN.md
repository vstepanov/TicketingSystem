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

**Last updated:** 2026-07-01 · **Overall:** 0 / 5 waves complete

### Wave status

| Wave | View | Mockup | Status | Notes |
|------|------|--------|--------|-------|
| 0 | Shared design-system fixes | (all) | `[ ]` pending | Do first — several views depend on it |
| 1 | Kanban Board | `01-kanban-board.png` | `[ ]` pending | |
| 2 | Auth flow (login / signup / verify) | `02-auth-flow.png` | `[ ]` pending | |
| 3 | Ticket details | `03-ticket-details.png` | `[ ]` pending | |
| 4 | Team management | `04-team-management.png` | `[ ]` pending | |
| 5 | Epic management | `05-epic-management.png` | `[ ]` pending | |

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

- `[ ]` **0.1 Relative-time helper.** Mockups use relative timestamps
  ("2h ago", "1d ago", "Today 12:40", "Yesterday", "Jun 20"). Today each
  `formatUtc` renders absolute UTC. Create one shared `formatRelative(iso)` (and
  keep an absolute variant for the ticket meta line) in a single util, e.g.
  `src/ui/format-time.ts`, and delete the copies in
  `TicketCard.tsx`, `teams/TeamRow.tsx`, `epics/EpicRow.tsx`, `tickets/use-ticket.ts`.
- `[ ]` **0.2 Table header casing.** `Table.tsx` `TH_STYLE` uppercases headers;
  mockups (Teams/Epics) show title-case headers ("Name", "Tickets", "Epics",
  "Modified", "Actions"). Remove `textTransform: "uppercase"` (or make it a prop)
  and match weight/color.
- `[ ]` **0.3 Numeric cell alignment.** Count columns (Tickets, Epics) render
  left-aligned pills; mockups show plain centered numbers. Decide: plain numbers
  centered (matches mockup) vs pills. Add a `Td align="center"` option to
  `Table.tsx` and apply on numeric columns.
- `[ ]` **0.4 Pill / count chip.** Board column count in the mockup is a rounded
  gray chip on the right of the header — confirm `Pill` sizing/shape matches
  (mockup chip looks slightly larger/rounder). Adjust `Pill.tsx` if needed.
- `[ ]` **0.5 Confirm token parity.** Spot-check spacing/radius/shadow tokens in
  `globals.css` against the mockups (card radius, borders). No change expected;
  document any intentional differences.

---

## Wave 1 — Kanban Board (`01-kanban-board.png`)

Files: `src/ui/board/BoardScreen.tsx`, `FilterBar.tsx`, `BoardColumn.tsx`,
`TicketCard.tsx`, `src/ui/Header.tsx`, `src/ui/NavTabs.tsx`.

- `[ ]` **1.1 Card drag handle.** Mockup cards have **no** visible drag handle;
  `TicketCard.tsx` renders a `⠿` handle button top-right. Options: make the whole
  card the drag source (keep a visually-hidden handle for keyboard a11y), or hide
  the handle until hover. Preserve keyboard DnD + `aria-label`.
- `[ ]` **1.2 Card timestamp.** Use relative time (0.1) and move it to the
  **bottom-right** of the card ("2h ago" / "1d ago"), matching the mockup layout.
- `[ ]` **1.3 Card badge row.** With the handle gone, the type badge (BUG/FEATURE)
  sits alone on the top row — verify badge pill styling matches (uppercase, gray
  fill, pill radius) per mockup.
- `[ ]` **1.4 Card spacing/height.** Mockup cards are taller with more vertical
  breathing room between title, epic line and timestamp. Adjust padding/gap.
- `[ ]` **1.5 Filter labels.** Mockup labels read "Search", "Type", "Epic".
  `FilterBar.tsx` uses `label="Search title"` — change to "Search" (keep the
  placeholder "Search title…").
- `[ ]` **1.6 Controls row.** Confirm "Team" select (left, labelled) and black
  "+ New ticket" button (top-right) align with the mockup; both sit above the
  filter card.
- `[ ]` **1.7 Column header.** Confirm uppercase column labels + right-aligned
  count chip match; canonical order NEW · READY FOR IMPLEMENTATION · IN PROGRESS ·
  READY FOR ACCEPTANCE · DONE.
- `[ ]` **1.8 Header/nav.** Confirm brand "TICKET TRACKER", centered tabs with the
  active tab's gray fill, and right-aligned user email + caret match the mockup.

---

## Wave 2 — Auth flow (`02-auth-flow.png`)

The mockup shows three reference cards (Log in / Create account / Email
verification). Files: `app/login/page.tsx`, `app/signup/page.tsx`,
`app/verify/verify-result.tsx`, `src/ui/AuthCard.tsx`.

- `[ ]` **2.1 Brand line.** `AuthCard.tsx` prints a "TICKET TRACKER" eyebrow the
  mockup cards don't show. Decide: remove it, or confirm it's an intentional
  addition. If kept, document the deviation here.
- `[ ]` **2.2 Verify success icon.** Mockup shows a large **circular** checkmark
  (gray circle, dark ✓) above "Email verified". `verify-result.tsx` renders only
  an inline "✓" text. Add the circular success graphic.
- `[ ]` **2.3 Login "not verified" block.** Mockup shows muted centered text
  "Account not verified?" above a full-width outlined "Resend email" button.
  Current code wraps it in a bordered gray box — restyle to match.
- `[ ]` **2.4 Button width.** Ensure primary/secondary buttons render full-width
  inside the card (submit buttons already stretch; "Continue to login" is wrapped
  in a `Link` + `Button` and may not — make it full-width).
- `[ ]` **2.5 Copy/labels.** Verify titles & subtitles match: "Log in" / "Use your
  verified account.", "Create account" / "Email verification is required."
  (password placeholder "Minimum 8 characters"), "Email verified" / "Your account
  is ready to use." and the "Expired or invalid link" error state.
- `[ ]` **2.6 Links.** "Create an account →" and "Already registered? Log in →"
  match mockup placement/weight.

---

## Wave 3 — Ticket details (`03-ticket-details.png`)

Files: `src/ui/tickets/TicketDetailScreen.tsx`, `TicketForm.tsx`,
`CommentsPanel.tsx`.

- `[ ]` **3.1 Back link label.** Mockup: "← Back to {Team name}"
  (e.g. "← Back to Payments Team"). Code hardcodes "← Back to board". Use the
  ticket's team name and link to `/board?teamId=…`.
- `[ ]` **3.2 Meta line box.** Mockup wraps the meta line
  ("TCK-… • Created by … • Created … UTC • Modified … UTC") in a subtle gray
  background bar; current code is plain muted text. Add the container styling.
- `[ ]` **3.3 Timestamp format.** Meta line uses "Jun 22, 09:15 UTC" style in the
  mockup; current `formatUtc` yields "2025-06-22 09:15 UTC". Add a month-name UTC
  formatter (see 0.1).
- `[ ]` **3.4 Title size.** Mockup title is a large bold heading (bigger than the
  current `--text-xl` / 20px). Bump the detail title size.
- `[ ]` **3.5 Form field layout.** Mockup row 1 = **Team · Type · State** (three
  columns), then **Epic** full-width, then Title, then Body. `TicketForm.tsx`
  currently uses Team+Epic / Type+State (2×2). Re-lay out to match.
- `[ ]` **3.6 Comments panel.** Give comment cards the light-gray fill shown in
  the mockup; confirm author (bold) + right-aligned time header.
- `[ ]` **3.7 Post-comment button.** Align "Post comment" to the **bottom-right**
  of the panel (currently left-aligned).
- `[ ]` **3.8 Header actions.** Confirm Delete (outlined) + Save (black) top-right
  match the mockup.

---

## Wave 4 — Team management (`04-team-management.png`)

Files: `src/ui/teams/TeamsScreen.tsx`, `TeamRow.tsx`, `CreateTeamPanel.tsx`.

- `[ ]` **4.1 Header.** Confirm large "Teams" title + caption "All verified users
  can view and manage all teams." + black "+ Create team" button top-right.
- `[ ]` **4.2 Table headers.** Apply title-case headers (Wave 0.2).
- `[ ]` **4.3 Count columns.** Render Tickets / Epics as plain centered numbers
  (Wave 0.3) rather than left-aligned pills, per mockup.
- `[ ]` **4.4 Modified column.** Use relative time — "Today 12:40", "Yesterday",
  "Jun 20" (Wave 0.1).
- `[ ]` **4.5 Delete disabled state.** Confirm disabled Delete renders as a grayed
  outlined button (mockup) with the helper line
  "Delete is disabled while a team contains tickets or epics."
- `[ ]` **4.6 Create-team panel.** Style `CreateTeamPanel` as the distinct card in
  the mockup: "Create team" heading, "Team name" label, placeholder
  "e.g. Platform Engineering", black "Create" button.

---

## Wave 5 — Epic management (`05-epic-management.png`)

Files: `src/ui/epics/EpicsScreen.tsx`, `EpicRow.tsx`, `EditEpicPanel.tsx`,
`CreateEpicPanel.tsx`.

- `[ ]` **5.1 Header layout.** Mockup: "Epics" title with the **Team** label+select
  directly beneath it (left), and "+ Create epic" black button top-right. Current
  code groups the Team select + Create button together on the right. Re-lay out.
- `[ ]` **5.2 Delete action = "×" icon.** Mockup uses a small square **×** icon
  button (grayed when disabled) for delete, not a "Delete" text button. Update
  `EpicRow.tsx` (keep `aria-label="Delete epic"` + disabled tooltip).
- `[ ]` **5.3 Table headers.** Title-case headers (Wave 0.2): Title · Tickets ·
  Modified · Actions.
- `[ ]` **5.4 Count / modified columns.** Centered numeric Tickets column
  (0.3) + relative Modified (0.1: "Today", "Jun 22", "Jun 19").
- `[ ]` **5.5 Row subtitle.** Confirm the muted description line under each epic
  title matches the mockup ("Short optional description…").
- `[ ]` **5.6 Edit-epic panel.** Confirm the right-side panel matches: "Edit epic"
  heading, Title input, "Description (optional)" textarea, Cancel (outline) + Save
  (black) bottom-right. (Already close — verify only.)
- `[ ]` **5.7 Helper line.** "Delete is disabled while tickets reference the epic."

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
