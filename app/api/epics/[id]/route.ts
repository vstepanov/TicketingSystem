/**
 * /api/epics/{id} item routes (plan §4.5).
 *
 * Both endpoints require a verified session (`requireUser` → 401 for anonymous
 * callers). The `id` path segment is a UUID (no session/token in URLs — §4.1).
 *
 *   PATCH  → edit title/description. 200 epic object. Errors: 400 (invalid input,
 *            incl. an attempt to change the immutable `teamId`), 404 unknown.
 *            `modified_at` advances only on a real field change (§4.5).
 *   DELETE → 204 on success. Errors: 404 unknown, 409 EPIC_REFERENCED when
 *            tickets still reference the epic (delete-restrict).
 *
 * Next 15 delivers dynamic route params asynchronously, hence `params` is a
 * Promise that must be awaited.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonOk, noContent } from "@/server/http/respond";
import { deleteEpic, updateEpic } from "@/server/services/epic.service";

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

    const epic = await updateEpic(id, body);
    return jsonOk(epic);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireUser();
    const { id } = await context.params;
    await deleteEpic(id);
    return noContent();
  } catch (error) {
    return errorResponse(error);
  }
}
