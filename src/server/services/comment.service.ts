/**
 * Comment service (business rules for ticket comments, plan §4.7).
 *
 * Server-side validation is authoritative:
 *
 *   - LIST (`GET /api/tickets/{id}/comments`): the ticket must exist (404 else);
 *     comments are returned OLDEST first (created_at ASC), each shaped as
 *     `{ id, author: { id, email }, body, createdAt }`.
 *   - CREATE (`POST /api/tickets/{id}/comments`): `body` is trimmed and must be
 *     non-empty (400 otherwise). The ticket must exist (404 else). The author is
 *     the SESSION user (never from the client body). Returns the created comment
 *     in the same shape.
 *   - CRITICAL (§4.7): posting a comment MUST NOT touch the parent ticket's
 *     `modified_at`. The service only writes the `comments` table — it never
 *     issues any update against `tickets` — so the ticket row is left untouched.
 *   - Comments are IMMUTABLE in mandatory scope: no edit/delete is implemented.
 */
import { db as defaultDb, type Database } from "@/server/db/client";
import { notFoundError } from "@/server/http/errors";
import { parseOrThrow, trimmedString } from "@/lib/validation";
import * as commentRepo from "@/server/repositories/comment.repo";
import { z } from "zod";

/** Create input schema (§4.7 POST): `body` trimmed non-empty. */
export const createCommentSchema = z
  .object({ body: trimmedString("Comment body is required") })
  .strict("Unknown field in request body");

/** The public comment object returned by list/create (§4.7). */
export interface CommentView {
  id: string;
  author: { id: string; email: string };
  body: string;
  createdAt: Date;
}

/** Shape an enriched comment row into the public view. */
function toView(row: commentRepo.CommentRow): CommentView {
  return {
    id: row.id,
    author: { id: row.authorId, email: row.authorEmail },
    body: row.body,
    createdAt: row.createdAt,
  };
}

/**
 * List a ticket's comments OLDEST first (§4.7 GET).
 *
 * @throws AppError 404 when the ticket does not exist.
 */
export async function listComments(
  ticketId: string,
  database: Database = defaultDb,
): Promise<CommentView[]> {
  const exists = await commentRepo.ticketExists(ticketId, database);
  if (!exists) {
    throw notFoundError("Ticket not found");
  }
  const rows = await commentRepo.listCommentsByTicket(ticketId, database);
  return rows.map(toView);
}

/**
 * Create a comment on a ticket (§4.7 POST).
 *
 * The parent ticket's `modified_at` is deliberately left untouched: only the
 * `comments` table is written (§4.7 "adding a comment does not change the
 * ticket").
 *
 * @param authorId The session user's id (authoritative — never from the body).
 * @throws AppError 400 empty body, 404 ticket missing.
 */
export async function createComment(
  ticketId: string,
  input: unknown,
  authorId: string,
  database: Database = defaultDb,
): Promise<CommentView> {
  const { body } = parseOrThrow(createCommentSchema, input);

  // Pre-check the ticket for a friendly 404 (the FK is the real guard).
  const exists = await commentRepo.ticketExists(ticketId, database);
  if (!exists) {
    throw notFoundError("Ticket not found");
  }

  const created = await commentRepo.insertComment(
    { ticketId, authorId, body },
    database,
  );
  return toView(created);
}
