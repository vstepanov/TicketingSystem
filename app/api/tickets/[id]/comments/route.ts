/**
 * /api/tickets/{id}/comments routes (plan §4.7).
 *
 * Both endpoints require a verified session (`requireUser` → 401 for anonymous
 * callers). The `id` path segment is the ticket UUID (no session/token in URLs —
 * §4.1).
 *
 *   GET  → 200 array of `{ id, author: { id, email }, body, createdAt }` ordered
 *          OLDEST first. Errors: 404 unknown ticket.
 *   POST → { body } trimmed non-empty. Author is the session user. 201 comment.
 *          Errors: 400 empty body, 404 unknown ticket. Posting a comment does
 *          NOT change the ticket's modified_at (§4.7).
 *
 * Comments are immutable in mandatory scope — no PATCH/DELETE handlers.
 *
 * Next 15 delivers dynamic route params asynchronously, hence `params` is a
 * Promise that must be awaited.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth/guard";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonCreated, jsonOk } from "@/server/http/respond";
import { createComment, listComments } from "@/server/services/comment.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireUser();
    const { id } = await context.params;
    const list = await listComments(id);
    return jsonOk(list);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON");
    }

    const comment = await createComment(id, body, user.id);
    return jsonCreated(comment);
  } catch (error) {
    return errorResponse(error);
  }
}
