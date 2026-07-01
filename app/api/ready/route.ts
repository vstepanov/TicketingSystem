/**
 * GET /api/ready — readiness probe (plan §4.9).
 *
 * Public endpoint (no auth guard). Checks database connectivity via a small
 * `SELECT 1` (see {@link checkDbReadiness}) and gates orchestration:
 *
 *   - 200 `{ status: "ready" }`     when the DB responds.
 *   - 503 `{ status: "not_ready" }` when the DB is unreachable or the query fails.
 *
 * The DB check never throws (it swallows errors and returns `ready: false`), so
 * this handler cannot emit an uncaught 500 for a downed database — it always
 * resolves to a clean 503. This is what the compose `web` healthcheck hits.
 */
import { checkDbReadiness } from "@/server/db/readiness";
import { jsonOk } from "@/server/http/respond";

// A readiness probe must reflect the live DB state on every call — never cache.
export const dynamic = "force-dynamic";

export async function GET() {
  const { ready } = await checkDbReadiness();
  return ready
    ? jsonOk({ status: "ready" })
    : jsonOk({ status: "not_ready" }, 503);
}
