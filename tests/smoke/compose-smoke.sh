#!/usr/bin/env bash
#
# Docker Compose smoke test (plan §6.1, S20 DoD #7 + #9).
#
# Proves the "one-command startup from a clean checkout" contract end to end on
# a machine with Docker + the Compose plugin:
#
#   1. `docker compose up --build -d`  — build images and start db + migrate + web
#   2. wait for GET /api/ready to return HTTP 200 (DB reachable, migrations done)
#   3. assert GET /api/health returns {"status":"ok"}
#   4. assert a FRESH database has ZERO application rows (no seed data)
#   5. always tear the stack down (`docker compose down -v`), even on failure
#
# ---------------------------------------------------------------------------
# NOT EXECUTED during authoring: the authoring sandbox has no Docker binary, so
# this script could not be run there. It is authored to be run by a developer or
# CI on a Docker-capable host:
#
#     bash tests/smoke/compose-smoke.sh
#
# Requires a local `.env` (copy from `.env.example`); the script creates a
# minimal one automatically if none exists. Exit code 0 = smoke passed.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

WEB_PORT="${WEB_PORT:-3000}"
BASE_URL="http://localhost:${WEB_PORT}"
READY_TIMEOUT="${READY_TIMEOUT:-180}"

log() { printf '\n=== %s ===\n' "$*"; }
fail() { printf '\nSMOKE FAILED: %s\n' "$*" >&2; exit 1; }

# --- preconditions ---------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "the docker compose plugin is required"

# Ensure an .env exists so `env_file: .env` in compose resolves. Never commit it.
if [[ ! -f .env ]]; then
  log "No .env found — generating a throwaway one for the smoke run"
  cp .env.example .env
  # Give SESSION_SECRET a real >=32 char value so env validation passes.
  SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n' | cut -c1-48)"
  # Portable in-place edit (macOS + GNU sed).
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" .env
  else
    sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" .env
  fi
fi

cleanup() {
  log "Tearing down (docker compose down -v)"
  docker compose down -v --remove-orphans || true
}
trap cleanup EXIT

# --- 1. build + start ------------------------------------------------------
log "docker compose up --build -d"
docker compose up --build -d

# --- 2. wait for readiness -------------------------------------------------
log "Waiting up to ${READY_TIMEOUT}s for ${BASE_URL}/api/ready"
deadline=$(( $(date +%s) + READY_TIMEOUT ))
until curl -fsS "${BASE_URL}/api/ready" >/dev/null 2>&1; do
  if [[ $(date +%s) -ge $deadline ]]; then
    log "web logs (tail):"; docker compose logs --tail=80 web || true
    fail "/api/ready did not return 200 within ${READY_TIMEOUT}s"
  fi
  sleep 3
done
log "readiness OK"

# --- 3. health probe -------------------------------------------------------
log "Checking ${BASE_URL}/api/health"
HEALTH="$(curl -fsS "${BASE_URL}/api/health")"
echo "health response: ${HEALTH}"
echo "${HEALTH}" | grep -q '"status":"ok"' || fail "health did not report ok"

# --- 4. fresh DB has zero application rows ---------------------------------
log "Asserting a fresh database has 0 application rows (DoD #9)"
DB_USER="${POSTGRES_USER:-ticketing}"
DB_NAME="${POSTGRES_DB:-ticketing}"

# Sum rows across every application table; must be exactly 0. __drizzle_migrations
# (schema metadata) is intentionally excluded — it is not application data.
COUNT_SQL="SELECT
  (SELECT count(*) FROM users)
+ (SELECT count(*) FROM verification_tokens)
+ (SELECT count(*) FROM teams)
+ (SELECT count(*) FROM epics)
+ (SELECT count(*) FROM tickets)
+ (SELECT count(*) FROM comments);"

TOTAL="$(docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$COUNT_SQL" | tr -d '[:space:]')"
echo "total application rows: ${TOTAL:-<none>}"
[[ "$TOTAL" == "0" ]] || fail "expected 0 application rows on a fresh DB, got '${TOTAL}'"

log "SMOKE PASSED: stack booted, health ok, readiness ok, fresh DB empty"
