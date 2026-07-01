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

**Last updated:** 2026-07-01 · **Overall:** 3 / 5 waves complete

### Wave status

| Wave | View | Mockup | Status | Notes |
|------|------|--------|--------|-------|
| 0 | Shared design-system fixes | (all) | `[x]` done | Consolidated time helpers + Table capabilities; no visible change |
| 1 | Kanban Board | `01-kanban-board.png` | `[x]` done | Whole card is now the drag source (no visible handle); relative bottom-right timestamp; Search label; taller cards. Header/nav/columns/controls already matched. |
| 2 | Auth flow (login / signup / verify) | `02-auth-flow.png` | `[x]` done | Removed "TICKET TRACKER" eyebrow from AuthCard; circular checkmark on verify success; centered "Account not verified?" + full-width outlined Resend on login; full-width "Continue to login". Copy/labels/links already matched. |
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
