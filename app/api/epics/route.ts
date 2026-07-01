/**
 * /api/epics collection routes (plan §4.5).
 *
 * Both endpoints require a verified session (`requireUser` → 401 for anonymous
 * callers). The route handlers are thin HTTP boundaries: they authenticate,
 * read the query / JSON body, delegate all business rules to the epic service,
 * and render the standard success/error envelope.
 *
 *   GET  → 200 array of `{ id, teamId, title, description, createdAt,
 *          modifiedAt, ticketCount, canDelete }`, sorted by title. Requires a
 *          `teamId` query param (400 if missing/invalid).
 *   POST → 201 epic object. Errors: 400 invalid input, 404 team missing.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonCreated, jsonOk } from "@/server/http/respond";
import { createEpic, listEpics } from "@/server/services/epic.service";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    // `teamId` is required; a missing param arrives as `null` (→ undefined) and
    // the service rejects it (and any non-UUID) with 400. Read from the raw URL
    // (not `nextUrl`) so the handler works with a plain `Request` too.
    const teamId =
      new URL(request.url).searchParams.get("teamId") ?? undefined;
    const epics = await listEpics(teamId);
    return jsonOk(epics);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON");
    }

    const epic = await createEpic(body);
    return jsonCreated(epic);
  } catch (error) {
    return errorResponse(error);
  }
}
