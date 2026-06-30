# Ticketing System

A Kanban-style ticket tracker built as a three-tier single-page application:

- **PostgreSQL 18** — persistent relational storage
- **Next.js (TypeScript) API** — server-side business logic and HTTP API
- **Next.js (TypeScript) SPA** — presentation tier

The full specification, architecture, database/backend/frontend plans, testing
strategy, and step-by-step implementation roadmap live in
[`docs/planning/IMPLEMENTATION_PLAN.md`](docs/planning/IMPLEMENTATION_PLAN.md).
Reference wireframes are in [`docs/01-architecture/wireframes/`](docs/01-architecture/wireframes/).

## Status

Planning phase — no application code yet. The plan is the source of truth; implementation
follows the roadmap in §7 of the plan.

## Getting started (target)

From a clean checkout, the complete solution will start from the repository root with:

```bash
docker compose up --build
```

No host-installed frontend, backend, or database runtime is required beyond Docker.
