/**
 * Comment repository (persistence tier, plan §4 layering).
 *
 * All Drizzle access to the `comments` table lives here so the service never
 * touches SQL directly. Every function takes the Drizzle client explicitly (the
 * shared app client by default) so callers can pass a transaction handle or an
 * ephemeral test client.
 *
 * Comments hang off a ticket (`comments.ticket_id` FK, CASCADE on ticket delete,
 * §3.2/§3.3). Listing is chronological — OLDEST first — served by the
 * `comments_ticket_id_created_at_idx` index (§3.5). Inserting a comment writes
 * ONLY the comments table; it never touches the parent ticket, so the ticket's
 * `modified_at` is left untouched (§4.7: "adding a comment does not change the
 * ticket").
 */
import { asc, eq } from "drizzle-orm";

import { db as defaultDb, type DbClient } from "@/server/db/client";
import { comments, tickets, users } from "@/server/db/schema";

/** A persisted comment row enriched with its author's id + email. */
export interface CommentRow {
  id: string;
  authorId: string;
  authorEmail: string;
  body: string;
  createdAt: Date;
}

/** Fields accepted on insert (id/createdAt are DB-assigned). */
export interface InsertCommentFields {
  ticketId: string;
  authorId: string;
  body: string;
}

/** Check a ticket exists (used to produce a friendly 404 before list/insert). */
export async function ticketExists(
  ticketId: string,
  database: DbClient = defaultDb,
): Promise<boolean> {
  const rows = await database
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);
  return rows.length > 0;
}

/**
 * List a ticket's comments OLDEST first (created_at ASC, §4.7), each joined to
 * its author's id + email. The INNER JOIN to `users` is safe because
 * `author_id` is a non-null FK.
 */
export async function listCommentsByTicket(
  ticketId: string,
  database: DbClient = defaultDb,
): Promise<CommentRow[]> {
  return database
    .select({
      id: comments.id,
      authorId: comments.authorId,
      authorEmail: users.email,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.ticketId, ticketId))
    .orderBy(asc(comments.createdAt), asc(comments.id));
}

/**
 * Insert a comment and return it enriched with the author's email. Writes ONLY
 * the `comments` table — the parent ticket is never updated, so its
 * `modified_at` is untouched (§4.7). A missing ticket/author trips a
 * foreign-key violation (23503) via the FKs; the service pre-checks the ticket
 * for a friendly 404, but the DB is the ultimate guard.
 */
export async function insertComment(
  fields: InsertCommentFields,
  database: DbClient = defaultDb,
): Promise<CommentRow> {
  const [inserted] = await database
    .insert(comments)
    .values({
      ticketId: fields.ticketId,
      authorId: fields.authorId,
      body: fields.body,
    })
    .returning({
      id: comments.id,
      authorId: comments.authorId,
      body: comments.body,
      createdAt: comments.createdAt,
    });

  // Resolve the author's email for the response shape. A second lightweight
  // read keeps the insert's RETURNING clause simple and avoids a join on write.
  const [author] = await database
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, inserted.authorId))
    .limit(1);

  return {
    id: inserted.id,
    authorId: inserted.authorId,
    authorEmail: author.email,
    body: inserted.body,
    createdAt: inserted.createdAt,
  };
}
