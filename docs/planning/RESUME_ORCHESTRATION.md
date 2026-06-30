# Resuming the Implementation Run (S02–S20)

This note explains how to continue the step-by-step build of the Kanban Ticketing
System on a **Docker-capable host**. The orchestration model, source of truth, and
per-step lifecycle are defined in `ORCHESTRATION_PROMPT.md` and `IMPLEMENTATION_PLAN.md`
(plan §7 roadmap + §8 sub-agent prompts). This file only records **current state**, the
**config corrections** discovered during the first run, and the **host prerequisites**
needed for the remaining steps.

## Current state

- **S01 — Repository scaffold & tooling: ✅ merged to `main`** (merge commit `7bb00c9`).
  Next.js 15 (App Router) + strict TypeScript, ESLint 9 (flat) + Prettier, Vitest,
  Playwright, the plan's folder layout, and all npm scripts (`dev`, `build`, `start`,
  `lint`, `test`, `test:e2e`, `db:generate`, `db:migrate` — the two `db:*` are stubs
  until S03). Gates passed: `next lint`, `tsc --noEmit`, `vitest run` (1 smoke test),
  `next build`.
- **S02 onward: not started.** The run halted at S02 because the original environment
  had no Docker.
- Next step to run: **S02 — Docker Compose + Postgres 18 + env**.

## Config (use these values)

| Key | Value | Note |
|-----|-------|------|
| `INTEGRATION_BRANCH` | `main` | The repo uses `main` (tracks `origin/main`); there is **no** `master`. The original config said `master` — use `main`. |
| `STEP_RANGE` | `S02..S20` | S01 is already merged. |
| `WORKTREE_ROOT` | `../ticketing-worktrees` | One worktree per step, branched off `main`. |
| `ON_FAILURE` | `stop` | Halt and report on the first failing gate. |
| `PUSH_AFTER_MERGE` | `false` | Remote (`origin/main`) is left untouched; flip to `true` to push after each merge. |
| `MERGE_STYLE` | `--no-ff` | Keep an explicit merge commit per step. |

## Host prerequisites

- **Docker + Docker Compose** — required from S02 on. `docker compose up --build` from
  the repo root must work (DoD-7). Verify with `docker --version` and
  `docker compose version` before starting.
- **Node 22 + npm** — for `npm ci`, lint, typecheck, build, and Vitest/Playwright.
- **Postgres 18 for DB-backed tests** — S03 migration tests and S05–S13 integration
  tests need a real database. Use the **`postgres:18-alpine`** image (Testcontainers or
  a disposable compose service). A fresh DB must contain schema + migration metadata
  only — **no seed/application data** (plan §11.8, DoD-9).
- **Playwright browsers** — `npx playwright install` before the E2E steps (S15+).
- **SMTP** — `relay1.dataart.com` (or a mock SMTP capture in tests); all SMTP/secret
  values come from env only, never source control (DoD-8).

## Per-step lifecycle (unchanged from `ORCHESTRATION_PROMPT.md`)

For each `Sxx` in ascending order, one at a time, never starting the next until the
previous is merged and green:

1. **Prep** — `git checkout main`; confirm clean tree; verify the step's prerequisites
   (plan §7) are already merged.
2. **Worktree** — `git worktree add -b step/Sxx ../ticketing-worktrees/Sxx main`.
3. **Implement** — delegate to one fresh sub-agent using the step's §8 prompt verbatim
   plus the §8 shared preamble; it works only inside the worktree and does **not** commit.
4. **Verify** (orchestrator runs these in the worktree — do not trust the sub-agent's word):
   `npm ci` (or `npm install` first time), `npm run lint`, `npx tsc --noEmit`,
   `npm run build`, `npm test`, plus the step's specific tests from §7. For the
   devops steps (S02, S13, S20) also run the compose smokes per §6:
   `docker compose config`, and for S20 `docker compose up --build` with the
   readiness + empty-DB assertions. Cross-check the step's verification checklist,
   acceptance criteria, and the §10 traceability rows.
5. **Commit** in the worktree: `Sxx: <title>`.
6. **Merge** `--no-ff` into `main` (push only if `PUSH_AFTER_MERGE=true`).
7. **Cleanup** — `git worktree remove …` then `git branch -d step/Sxx`.
8. **Record** — tick `### ☐ Sxx` → `### ☑ Sxx` in the plan and the matching §9 /
   §9.7 rows; commit on `main` as `docs: mark Sxx complete`.

If any gate fails, follow `ON_FAILURE=stop`: halt, leave the worktree and branch for
inspection, and report the failing command and output.

## Hard rules (from the plan)

One step in flight at a time, strict §7 prerequisite ordering; never merge a step whose
verification did not fully pass; never commit secrets or `.env`; never add seed/demo
application data; keep the three tiers (presentation / API / persistence) separated;
the orchestrator gates and reports — sub-agents write the feature code inside their
worktree.

## Environment caveats observed in the first run

- The host-mounted working folder was **far too slow** for npm's install/reify phase
  (a 9p/virtiofs mount). The S01 sub-agent installed `node_modules` onto fast local
  storage and symlinked it into the worktree; `node_modules` is gitignored, so this was
  transparent to commits. On a normal Docker host with local-disk checkouts, a plain
  `npm ci` works without this workaround.
- An untracked `.claude/` directory (session tooling) may appear at the repo root; it is
  not part of the project and should not be committed (add to `.gitignore` if it is
  distracting).
