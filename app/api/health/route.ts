/**
 * GET /api/health — liveness probe (plan §4.9).
 *
 * Public endpoint (no auth guard). Reports only that the process is up and able
 * to serve HTTP; it deliberately does NOT touch the database — that is the job
 * of the readiness probe (`GET /api/ready`). Always returns 200 `{ status: "ok" }`.
 */
import { jsonOk } from "@/server/http/respond";

// Never cache a liveness probe.
export const dynamic = "force-dynamic";

export function GET() {
  return jsonOk({ status: "ok" });
}
