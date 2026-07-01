# Ticket Tracker — Kanban Ticketing System

A Kanban-style ticket tracker built as a clean three-tier application:

- **PostgreSQL 18** — durable relational storage (all application state).
- **Next.js (TypeScript) API** — server-side business logic, validation, auth.
- **Next.js (TypeScript) SPA** — the presentation tier (board, teams, epics,
  tickets, comments).

One Next.js process serves both the SPA and the `/api` route handlers, but the
three tiers stay separated by directory and module boundaries. The full
specification, architecture, and step-by-step roadmap live in
[`docs/planning/IMPLEMENTATION_PLAN.md`](docs/planning/IMPLEMENTATION_PLAN.md).

---

## Prerequisites

For the one-command startup, the **only** host requirement is:

- **Docker** with the **Docker Compose** plugin (`docker compose version`).

For running the test suites or local development directly on the host you also
need **Node.js 22+** and npm.

SMTP is **not** containerized — verification emails are sent to an external relay
(`relay1.dataart.com` by default), configured via environment variables.

---

## Configuration

All configuration comes from environment variables (validated at startup by
`src/lib/env.ts`). Copy the template and fill in real values — `.env` is
git-ignored and must never be committed:

```bash
cp .env.example .env
```

Then set at least:

| Variable         | Purpose                                                        | Notes |
|------------------|---------------------------------------------------------------|-------|
| `SESSION_SECRET` | Signs the HttpOnly session cookie.                            | **Required.** ≥ 32 chars. Generate with `openssl rand -base64 48`. |
| `DATABASE_URL`   | Postgres connection string.                                   | Defaults to the compose `db` service; change with the `POSTGRES_*` vars. |
| `APP_URL`        | Public base URL used to build verification links.             | e.g. `http://localhost:3000`. |
| `SMTP_HOST`      | SMTP relay host.                                              | Default `relay1.dataart.com`. |
| `SMTP_PORT`      | SMTP relay port.                                              | Default `587` (STARTTLS). |
| `SMTP_USER` / `SMTP_PASS` | SMTP credentials.                                   | Optional — leave blank if the relay accepts unauthenticated mail. |
| `SMTP_FROM`      | From address on outbound email.                              | e.g. `Ticket Tracker <no-reply@dataart.com>`. |

See `.env.example` for the complete, commented catalogue of every variable.
**No secret is ever hard-coded** — all credentials come from env only.

---

## One-command startup

From a clean checkout, with only Docker installed:

```bash
docker compose up --build
```

This starts three services with correct ordering (see `docker-compose.yml`):

1. **`db`** — PostgreSQL 18; becomes healthy via `pg_isready`.
2. **`migrate`** — one-shot; waits for `db` healthy, applies all migrations
   (`db/migrations/`), then exits. A fresh database ends up with the full schema
   and **zero application rows** (no seed/demo data).
3. **`web`** — the Next.js app; waits for `migrate` to complete successfully,
   then serves traffic. Its healthcheck polls `GET /api/ready` (DB reachable).

Once healthy, open <http://localhost:3000>. Sign up, follow the verification
link from the email, log in, and create teams / epics / tickets.

Tear everything down (including the database volume) with:

```bash
docker compose down -v
```

---

## Running the tests

The test pyramid (plan §6) is split by layer. Unit, integration, and migration
tests boot a real, disposable PostgreSQL 18 via `embedded-postgres` — no Docker
needed for those.

```bash
npm install                 # once

npm run test                # everything vitest runs (unit + component + integration + migration)
npm run test:unit           # pure logic + React component tests (no DB)
npm run test:integration    # service/repo/route tests against ephemeral Postgres
npm run test:migration      # schema shape, 0-rows, idempotency against ephemeral Postgres
```

### End-to-end (Playwright)

The E2E suite runs the **real built app** against an ephemeral Postgres and an
in-process SMTP capture server (both started by Playwright's global setup). It
walks the full journey: signup → verify → login → team → epic → ticket → drag →
refresh, plus focused auth-error and drag-rollback specs.

The verification token is recovered from the **captured email** (the DB only
stores its hash), exactly as a real user would read it from their inbox.

```bash
npx playwright install       # once — download browser binaries
npm run test:e2e             # builds the app, then runs the specs
```

### Docker Compose smoke

Proves the clean-checkout boot on a Docker-capable host: brings the stack up,
waits for readiness, checks `/api/health`, asserts a fresh DB has zero
application rows, then tears down.

```bash
npm run test:smoke           # bash tests/smoke/compose-smoke.sh
```

---

## Architecture overview

```
Browser (SPA, TanStack Query)
        │  HTTP (JSON) + session cookie
        ▼
Next.js Route Handlers  (app/api/**/route.ts)   ← Application / API tier
        │  → service layer (business rules, Zod validation, enum/ref checks)
        │  → repository layer (Drizzle queries)
        ▼
PostgreSQL 18            ← Persistence tier (constraints, enums, indexes)
        ▲
        └── SMTP relay (Nodemailer) for verification email
```

- **Auth:** cookie-based session (HttpOnly, Secure, SameSite=Lax); no session id
  in any URL. The single-use verification token is the only token in a URL.
- **Validation:** server-side (Zod) is authoritative; client validation is
  UX-only.
- **Data integrity:** native PG enums, case-insensitive uniqueness (citext),
  `ON DELETE RESTRICT`/`CASCADE`, a composite FK enforcing "a ticket's epic
  belongs to the ticket's team", and non-empty `CHECK`s.
- **No seed data:** a fresh DB contains schema + migration metadata only.

Full detail, diagrams, ERD, and the requirements traceability matrix are in
[`docs/planning/IMPLEMENTATION_PLAN.md`](docs/planning/IMPLEMENTATION_PLAN.md).

---

## Tech stack

| Concern            | Choice |
|--------------------|--------|
| Language           | TypeScript (strict) |
| Framework (FE+BE)  | Next.js (App Router) |
| Database           | PostgreSQL 18 (Docker) |
| ORM / migrations   | Drizzle ORM + drizzle-kit |
| Password hashing   | Argon2id (`@node-rs/argon2`) |
| Validation         | Zod |
| Server state       | TanStack Query |
| Drag & drop        | `@dnd-kit/core` (accessible, keyboard-capable) |
| Email              | Nodemailer (SMTP) |
| Tests              | Vitest (unit/integration/migration), Playwright (E2E), `embedded-postgres` |
| Container          | Docker + Docker Compose |

---

## Project layout

```
app/                 Next.js routes (pages + app/api/**/route.ts handlers)
src/server/          services, repositories, db (schema/client), http, auth
src/ui/              shared React components + screen components
src/lib/             env loader, api client, validation helpers
db/migrations/       drizzle-kit generated SQL migrations
scripts/migrate.ts   migration runner (compose `migrate` + test harness)
tests/unit/          pure-logic + component unit tests
tests/integration/   service/repo/route tests (ephemeral Postgres)
tests/migration/     schema-shape / 0-rows / idempotency tests
tests/e2e/           Playwright specs + helpers (mock SMTP, global setup)
tests/smoke/         docker compose smoke script
```
