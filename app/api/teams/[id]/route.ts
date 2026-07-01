/**
 * /api/teams/{id} item routes (plan §4.4).
 *
 * Both endpoints require a verified session (`requireUser` → 401 for anonymous
 * callers). The `id` path segment is a UUID (no session/token in URLs — §4.1).
 *
 *   PATCH  → rename. 200 team object. Errors: 400 empty, 404 unknown, 409 dup.
 *            `modified_at` advances only on a real name change (§4.4).
 *   DELETE → 204 on success. Errors: 404 unknown, 409 TEAM_NOT_EMPTY when the
 *            team still has tickets or epics (cascading delete forbidden).
 *
 * Next 15 delivers dynamic route params asynchronously, hence `params` is a
 * Promise that must be awaited.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonOk, noContent } from "@/server/http/respond";
import { deleteTeam, renameTeam } from "@/server/services/team.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireUser();
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON");
    }

    const team = await renameTeam(id, body);
    return jsonOk(team);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireUser();
    const { id } = await context.params;
    await deleteTeam(id);
    return noContent();
  } catch (error) {
    return errorResponse(error);
  }
}
