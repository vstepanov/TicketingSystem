/**
 * /api/board query route (plan §4.8).
 *
 * Requires a verified session (`requireUser` → 401 for anonymous callers). The
 * handler is a thin HTTP boundary: it authenticates, reads the query string,
 * delegates all validation + business rules to the board service, and renders
 * the standard success/error envelope (ISO-8601 UTC timestamps).
 *
 *   GET → 200 `{ teamId, total, columns: { <state>: { count, tickets } } }`
 *         with all five state columns present (even when empty). Errors: 400
 *         (missing/invalid teamId or bad enum filter).
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { getBoard } from "@/server/services/board.service";

export async function GET(request: NextRequest) {
  try {
    await requireUser();

    // Read from the raw URL (not `nextUrl`) so the handler works with a plain
    // `Request` too. Missing params arrive as `null`; map them to `undefined`
    // so the service's optional filters are treated as absent (not invalid).
    const params = new URL(request.url).searchParams;
    const board = await getBoard({
      teamId: params.get("teamId") ?? undefined,
      type: params.get("type") ?? undefined,
      epicId: params.get("epicId") ?? undefined,
      q: params.get("q") ?? undefined,
    });
    return jsonOk(board);
  } catch (error) {
    return errorResponse(error);
  }
}
