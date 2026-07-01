/**
 * Board service (business rules for the Kanban board query, plan §4.8).
 *
 * Server-side validation is authoritative:
 *
 *   - `teamId` (a UUID) is REQUIRED; a missing/invalid value is a 400.
 *   - `type` is optional and validated against the `ticket_type` enum (§3.4);
 *     an unknown value is a 400 (defense in depth, before it reaches SQL).
 *   - `epicId` is optional and must be a UUID (400 otherwise).
 *   - `q` is an optional case-insensitive substring matched against the ticket
 *     title (§4.8). It is trimmed; a blank value is treated as "no search".
 *   - Filters combine with AND.
 *
 * The repository runs a single ordered query (index-friendly, usable at 100+
 * tickets — see {@link listBoardCards}); this service groups the flat result
 * into the five state columns in canonical board order, computes per-column
 * counts and the total, and always returns all five columns even when empty.
 * The grouping/sorting/shaping is a pure function ({@link groupIntoColumns}) so
 * it is directly unit-testable without a database.
 */
import { z } from "zod";

import { db as defaultDb, type Database } from "@/server/db/client";
import { parseOrThrow } from "@/lib/validation";
import { ticketStateEnum, ticketTypeEnum } from "@/server/db/schema";
import * as ticketRepo from "@/server/repositories/ticket.repo";

/** A UUID string schema with a friendly message. */
function uuidField(message: string) {
  return z
    .string({ required_error: message, invalid_type_error: message })
    .uuid(message);
}

/**
 * Canonical board column order (§ glossary): New → Ready for Implementation →
 * In Progress → Ready for Acceptance → Done. This drives both the response key
 * order and the empty-column scaffolding, so all five columns are always
 * present.
 */
export const BOARD_COLUMN_ORDER = ticketStateEnum.enumValues;

/** Query-parameter schema (§4.8). Only `teamId` is required. */
export const boardQuerySchema = z.object({
  teamId: uuidField("A valid teamId is required"),
  type: z
    .enum(ticketTypeEnum.enumValues, {
      invalid_type_error: "A valid type filter is required",
    })
    .optional(),
  epicId: uuidField("A valid epicId is required").optional(),
  q: z
    .string()
    .transform((value) => value.trim())
    .optional(),
});

/** A single board card in the response (§4.8). */
export interface BoardCard {
  id: string;
  title: string;
  type: ticketRepo.TicketType;
  epicTitle: string | null;
  modifiedAt: Date;
}

/** One state column: its post-filter count and its ordered cards (§4.8). */
export interface BoardColumn {
  count: number;
  tickets: BoardCard[];
}

/** The board response payload (§4.8): all five columns, counts, and total. */
export interface BoardView {
  teamId: string;
  total: number;
  columns: Record<ticketRepo.TicketState, BoardColumn>;
}

/** Shape a repo card row into the response card (drops `state`). */
function toCard(row: ticketRepo.BoardCardRow): BoardCard {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    epicTitle: row.epicTitle,
    modifiedAt: row.modifiedAt,
  };
}

/**
 * Group flat, `modified_at DESC`-ordered card rows into the five state columns
 * in canonical board order (§4.8). Pure and DB-free so it is unit-testable.
 *
 * Every column is scaffolded up front (count 0, `tickets: []`), so all five are
 * present even when a state has no tickets. Rows keep their incoming order, so
 * within each column the recency ordering supplied by the query is preserved.
 * `total` is the sum of the per-column counts (i.e. the filtered row count).
 */
export function groupIntoColumns(
  teamId: string,
  rows: ticketRepo.BoardCardRow[],
): BoardView {
  const columns = {} as Record<ticketRepo.TicketState, BoardColumn>;
  for (const state of BOARD_COLUMN_ORDER) {
    columns[state] = { count: 0, tickets: [] };
  }

  for (const row of rows) {
    columns[row.state].tickets.push(toCard(row));
  }

  let total = 0;
  for (const state of BOARD_COLUMN_ORDER) {
    const column = columns[state];
    column.count = column.tickets.length;
    total += column.count;
  }

  return { teamId, total, columns };
}

/**
 * Build the board view for a team (§4.8 GET /api/board).
 *
 * @param query Raw query parameters (`teamId` required; `type`/`epicId`/`q`
 *   optional). Validated here — server-side validation is authoritative.
 * @throws AppError 400 when `teamId` is missing/invalid or a filter is invalid.
 */
export async function getBoard(
  query: unknown,
  database: Database = defaultDb,
): Promise<BoardView> {
  const { teamId, type, epicId, q } = parseOrThrow(boardQuerySchema, query);

  const rows = await ticketRepo.listBoardCards(
    teamId,
    { type, epicId, q: q && q.length > 0 ? q : undefined },
    database,
  );

  return groupIntoColumns(teamId, rows);
}
