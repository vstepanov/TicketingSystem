/**
 * /api/tickets/{id}/state route (plan §4.6 state endpoint, §2.8).
 *
 * A dedicated, compact drag-and-drop state update: small request/response so the
 * board can persist a column move and re-sort fast. Requires a verified session
 * (`requireUser` → 401 for anonymous callers). The `id` path segment is a UUID
 * (no session/token in URLs — §4.1).
 *
 *   PATCH → validate `state` ∈ ticket_state enum (any state → any state allowed;
 *           sequential transitions NOT enforced). Persist immediately and
 *           advance `modified_at` on a real change. 200 `{ id, state, modifiedAt }`.
 *           Errors: 400 (invalid/missing state), 404 (unknown ticket).
 *
 * Next 15 delivers dynamic route params asynchronously, hence `params` is a
 * Promise that must be awaited.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { updateTicketState } from "@/server/services/ticket.service";

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

    const result = await updateTicketState(id, body);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
