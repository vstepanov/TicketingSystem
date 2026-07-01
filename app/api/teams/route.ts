/**
 * /api/teams collection routes (plan §4.4).
 *
 * Both endpoints require a verified session (`requireUser` → 401 for anonymous
 * callers). The route handlers are thin HTTP boundaries: they authenticate,
 * parse the JSON body, delegate all business rules to the team service, and
 * render the standard success/error envelope.
 *
 *   GET  → 200 array of `{ id, name, createdAt, modifiedAt, ticketCount,
 *          epicCount, canDelete }`, sorted by name.
 *   POST → 201 team object. Errors: 400 empty name, 409 duplicate name.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonCreated, jsonOk } from "@/server/http/respond";
import { createTeam, listTeams } from "@/server/services/team.service";

export async function GET() {
  try {
    await requireUser();
    const teams = await listTeams();
    return jsonOk(teams);
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

    const team = await createTeam(body);
    return jsonCreated(team);
  } catch (error) {
    return errorResponse(error);
  }
}
