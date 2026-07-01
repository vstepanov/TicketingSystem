/**
 * /api/tickets collection route (plan §4.6).
 *
 * Requires a verified session (`requireUser` → 401 for anonymous callers). The
 * handler is a thin HTTP boundary: it authenticates, reads the JSON body,
 * delegates all business rules to the ticket service, and renders the standard
 * success/error envelope. `created_by` is taken from the session — never the
 * body (§4.6).
 *
 *   POST → 201 full ticket object. Errors: 400 (bad enum / empty / cross-team
 *          epic), 404 (team/epic missing).
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonCreated } from "@/server/http/respond";
import { createTicket } from "@/server/services/ticket.service";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON");
    }

    const ticket = await createTicket(body, user.id);
    return jsonCreated(ticket);
  } catch (error) {
    return errorResponse(error);
  }
}
