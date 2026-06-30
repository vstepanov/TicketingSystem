# Implementation Orchestrator Prompt

Copy the **Orchestrator prompt** below into a Claude Code session opened at the repo
root (`/Users/vstepanov/projects/TicketingSystem`). It drives the whole build by
iterating the roadmap steps in
[`docs/planning/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) §7 and executing each
one in an isolated git worktree via a sub-agent, with this per-step flow:

```
create worktree → implement → verify/test → commit → merge to master → cleanup worktree
```

---

## Configuration (edit before running)

| Setting | Default | Notes |
|---------|---------|-------|
| `INTEGRATION_BRANCH` | `master` | The branch every step merges into. |
| `STEP_RANGE` | `S01..S20` | Which roadmap steps to run (inclusive, in order). |
| `WORKTREE_ROOT` | `../ticketing-worktrees` | Sibling dir holding per-step worktrees (kept out of the repo). |
| `ON_FAILURE` | `stop` | `stop` = halt and leave the worktree for debugging; `skip` = record failure and continue. |
| `PUSH_AFTER_MERGE` | `false` | If `true`, run `git push origin <INTEGRATION_BRANCH>` after each successful merge (requires GitHub auth on this machine). |
| `MERGE_STYLE` | `--no-ff` | Keeps a merge commit per step for a readable history. |

---

## Orchestrator prompt

```text
You are the IMPLEMENTATION ORCHESTRATOR for the Kanban Ticketing System.
Working directory: the repository root. Source of truth: docs/planning/IMPLEMENTATION_PLAN.md.

CONFIG (use these exact values unless I overrode them above):
- INTEGRATION_BRANCH = master
- STEP_RANGE = S01..S20
- WORKTREE_ROOT = ../ticketing-worktrees
- ON_FAILURE = stop
- PUSH_AFTER_MERGE = false
- MERGE_STYLE = --no-ff

GOAL
Implement the system one roadmap step at a time. For each step Sxx in STEP_RANGE,
in ascending order, run the full per-step lifecycle below by delegating the coding
work to a fresh sub-agent (Task tool). Do NOT implement step code yourself — your job
is orchestration, gating, and reporting. Process exactly one step at a time; never
start a step until the previous step has been merged to INTEGRATION_BRANCH and is green.

BEFORE THE LOOP
1. Read docs/planning/IMPLEMENTATION_PLAN.md fully. Extract the ordered list of steps
   from §7 (S01..S20): for each, capture title, goal, scope, files likely to change,
   prerequisites, implementation checklist, verification checklist, tests to add/run,
   acceptance criteria, complexity, and risk. Also read that step's matching sub-agent
   prompt in §8 — it is the canonical task spec for the step.
3. Confirm git is clean on INTEGRATION_BRANCH:
     git -C . status --porcelain   (must be empty)
     git rev-parse --abbrev-ref HEAD   (must equal INTEGRATION_BRANCH)
   If not clean or not on INTEGRATION_BRANCH, STOP and report.
4. Print the planned step order and wait for nothing — proceed automatically.

PER-STEP LIFECYCLE  (repeat for each Sxx)
A. PREP
   - Ensure INTEGRATION_BRANCH is current: `git checkout <INTEGRATION_BRANCH>`;
     if PUSH_AFTER_MERGE, also `git pull --ff-only`.
   - Verify all of this step's prerequisites (from §7) are already merged. If a
     prerequisite is missing, STOP and report.

B. CREATE WORKTREE
   - BRANCH = step/Sxx ; WT = <WORKTREE_ROOT>/Sxx
   - `git worktree add -b <BRANCH> <WT> <INTEGRATION_BRANCH>`
   - All implementation + tests for this step happen inside <WT>.

C. IMPLEMENT (delegate to a sub-agent)
   - Launch ONE sub-agent (general-purpose) whose working directory is <WT>.
   - Give it the step's §8 sub-agent prompt verbatim, plus the shared preamble at the
     top of §8, plus: "Work only inside <WT>. Honor §3/§4/§5/§11 of the plan.
     Server-side validation is authoritative. Do not add seed data. Do not commit;
     leave changes staged-or-unstaged in the worktree and report what you changed and
     how to verify." 
   - The sub-agent returns a summary of files created/changed and the exact verify
     commands it expects to pass.

D. VERIFY / TEST  (orchestrator runs these in <WT>, do not trust the sub-agent's word)
   - Install deps if needed: `npm ci` (or `npm install` on first step).
   - Run, and require all to pass:
       npm run lint
       npx tsc --noEmit         (typecheck)
       npm run build
       npm test                 (plus any step-specific test command from §7 "tests to add/run")
   - For Docker/devops steps (S02, S13, S20) also run the relevant smoke per §6:
       docker compose config
       (S20) docker compose up --build  + readiness/empty-DB assertions
   - Cross-check the step's VERIFICATION CHECKLIST and ACCEPTANCE CRITERIA from §7
     and the relevant traceability rows in §10. If any command fails or any acceptance
     item is unmet: follow ON_FAILURE (see below). Otherwise continue.

E. COMMIT (in <WT>)
   - `git add -A`
   - `git commit -m "Sxx: <step title>" -m "<one-line summary of what landed>"`

F. MERGE TO INTEGRATION_BRANCH
   - `git checkout <INTEGRATION_BRANCH>`
   - `git merge <MERGE_STYLE> <BRANCH> -m "Merge Sxx: <step title>"`
   - If the merge conflicts, follow ON_FAILURE (leave worktree + branch for inspection).
   - If PUSH_AFTER_MERGE is true: `git push origin <INTEGRATION_BRANCH>`.

G. CLEANUP WORKTREE
   - `git worktree remove <WT>` (use `--force` only if it refuses due to build artifacts)
   - `git branch -d <BRANCH>` (the merge made it fully reachable, so -d is safe)
   - Confirm with `git worktree list` that <WT> is gone.

H. RECORD PROGRESS
   - Tick this step's checkbox(es) in docs/planning/IMPLEMENTATION_PLAN.md:
     change `### ☐ Sxx` to `### ☑ Sxx`, and update the matching items in §9 tracking
     tables and §9.7 DoD mapping where the step satisfies them. Commit this doc update
     directly on INTEGRATION_BRANCH: `git commit -am "docs: mark Sxx complete"`.
   - Append a line to the run log (see REPORTING).

ON_FAILURE HANDLING
- If ON_FAILURE = stop: HALT immediately. Do NOT clean up the worktree or branch.
  Report: the step, the failing command, the full error output, the worktree path, and
  the branch name so I can debug. Do not proceed to later steps.
- If ON_FAILURE = skip: record the failure with details, run cleanup G (remove worktree,
  keep the branch named step/Sxx-FAILED for inspection via `git branch -m`), and continue
  to the next step ONLY if no later step lists Sxx as a prerequisite; otherwise stop.

REPORTING
- Maintain an in-session run log and, at the end (or on stop), print a table:
  | Step | Title | Result | Merge commit | Tests run | Notes |
- After the loop completes, print: total steps merged, any skipped/failed, and the final
  `git log --oneline` of INTEGRATION_BRANCH.

HARD RULES
- One step in flight at a time; strict prerequisite ordering from §7.
- Never merge a step whose verification did not fully pass.
- Never commit secrets or .env; ensure .gitignore covers them (it does).
- Never add seed/demo application data (plan §11.8, DoD #9).
- Keep the three tiers separated (plan §2.1).
- The orchestrator does not write feature code; sub-agents do, inside their worktree.
```

---

## Quick reference — the git commands per step

```bash
# config
INTEGRATION_BRANCH=master
WT_ROOT=../ticketing-worktrees
STEP=S01                      # iterate S01..S20
TITLE="Repository scaffold & tooling"

# A. prep
git checkout "$INTEGRATION_BRANCH"

# B. worktree
git worktree add -b "step/$STEP" "$WT_ROOT/$STEP" "$INTEGRATION_BRANCH"
cd "$WT_ROOT/$STEP"

# C. implement (sub-agent edits files here)

# D. verify
npm ci && npm run lint && npx tsc --noEmit && npm run build && npm test

# E. commit
git add -A && git commit -m "$STEP: $TITLE"

# F. merge
cd -                          # back to repo root (INTEGRATION_BRANCH checked out)
git merge --no-ff "step/$STEP" -m "Merge $STEP: $TITLE"
# git push origin "$INTEGRATION_BRANCH"   # only if PUSH_AFTER_MERGE=true

# G. cleanup
git worktree remove "$WT_ROOT/$STEP"
git branch -d "step/$STEP"
git worktree list
```

## Notes & caveats

- **Branch name:** this repo's integration branch is currently `master`. If you rename
  it to `main`, set `INTEGRATION_BRANCH=main` in the config.
- **node_modules per worktree:** worktrees share `.git` but have separate working files,
  and `node_modules/` is gitignored — so each worktree runs its own `npm ci`. For speed,
  enable a shared cache (`npm config set cache <path>`) or use pnpm with a global store.
- **First steps have no test scripts yet:** S01 creates the `npm run lint/build/test`
  scripts. For S01 the orchestrator should run whatever scripts exist after S01 lands;
  treat "no script" as "skip that command" only for S01, and require them from S02 on.
- **Docker steps:** S02/S13/S20 verification needs Docker running locally.
- **Stop-and-debug:** with `ON_FAILURE=stop`, a failed step leaves `step/Sxx` and its
  worktree intact so you can `cd` in, inspect, fix, and re-run from step D.
