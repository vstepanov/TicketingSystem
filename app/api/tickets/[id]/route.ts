/**
 * /api/tickets/{id} item routes (plan §4.6).
 *
 * All endpoints require a verified session (`requireUser` → 401 for anonymous
 * callers). The `id` path segment is a UUID (no session/token in URLs — §4.1).
 *
 *   GET    → 200 full ticket + author email + epic title. Errors: 404 unknown.
 *   PATCH  → edit type/teamId/epicId/title/body/state. 200 ticket. Errors: 400
 *            (bad enum / empty / cross-team epic), 404 unknown. `modified_at`
 *            advances only on a real field change (§4.6).
 *   DELETE → 204 on success (cascades comments). Errors: 404 unknown.
 *
 * Next 15 delivers dynamic route params asynchronously, hence `params` is a
 * Promise that must be awaited.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonOk, noContent } from "@/server/http/respond";
import {
  deleteTicket,
  getTicket,
  updateTicket,
} from "@/server/services/ticket.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireUser();
    const { id } = await context.params;
    const ticket = await getTicket(id);
    return jsonOk(ticket);
  } catch (error) {
    return errorResponse(error);
  }
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

    const ticket = await updateTicket(id, body);
    return jsonOk(ticket);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireUser();
    const { id } = await context.params;
    await deleteTicket(id);
    return noContent();
  } catch (error) {
    return errorResponse(error);
  }
}
