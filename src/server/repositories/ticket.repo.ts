/**
 * Ticket repository (persistence tier, plan §4 layering).
 *
 * All Drizzle access to the `tickets` table lives here so the service never
 * touches SQL directly. Every function takes the Drizzle client explicitly (the
 * shared app client by default) so callers can pass a transaction handle or an
 * ephemeral test client.
 *
 * The cross-team epic rule is guaranteed at the DB level by the composite FK
 * `tickets(epic_id, team_id) -> epics(id, team_id)` (§3.2): an insert/update that
 * references an epic belonging to another team trips a foreign-key violation
 * (23503). The service pre-checks for a friendly 400, but the DB is the ultimate
 * backstop (even under concurrency).
 */
import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";

import { db as defaultDb, type DbClient } from "@/server/db/client";
import { epics, teams, tickets, users } from "@/server/db/schema";

/** The canonical ticket type enum values (§3.4). */
export type TicketType = (typeof tickets.type.enumValues)[number];
/** The canonical ticket state enum values (§3.4). */
export type TicketState = (typeof tickets.state.enumValues)[number];

/** A persisted ticket row (all columns). */
export interface TicketRow {
  id: string;
  teamId: string;
  epicId: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  modifiedAt: Date;
}

/** A ticket row enriched with author email + epic title (for the detail view). */
export interface TicketDetailRow extends TicketRow {
  authorEmail: string;
  epicTitle: string | null;
}

/** Fields accepted on insert (defaults applied by the caller/DB). */
export interface InsertTicketFields {
  teamId: string;
  epicId: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  createdBy: string;
}

/** Fields the service may update (never `createdBy`/`createdAt`). */
export interface UpdateTicketFields {
  teamId: string;
  epicId: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
}

/** Look up a single ticket by id (all columns), or `undefined`. */
export async function findTicketById(
  id: string,
  database: DbClient = defaultDb,
): Promise<TicketRow | undefined> {
  const rows = await database
    .select()
    .from(tickets)
    .where(eq(tickets.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Look up a ticket by id joined with its author email and (optional) epic title,
 * for the detail view (§4.6 GET). Returns `undefined` when the ticket is absent.
 *
 * A LEFT JOIN to `epics` keeps tickets with a NULL `epic_id` (epicTitle comes
 * back `null`); an INNER JOIN to `users` is safe because `created_by` is a
 * non-null FK.
 */
export async function findTicketDetailById(
  id: string,
  database: DbClient = defaultDb,
): Promise<TicketDetailRow | undefined> {
  const rows = await database
    .select({
      id: tickets.id,
      teamId: tickets.teamId,
      epicId: tickets.epicId,
      type: tickets.type,
      state: tickets.state,
      title: tickets.title,
      body: tickets.body,
      createdBy: tickets.createdBy,
      createdAt: tickets.createdAt,
      modifiedAt: tickets.modifiedAt,
      authorEmail: users.email,
      epicTitle: epics.title,
    })
    .from(tickets)
    .innerJoin(users, eq(users.id, tickets.createdBy))
    .leftJoin(epics, eq(epics.id, tickets.epicId))
    .where(eq(tickets.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Insert a new ticket. A missing team/epic or a cross-team epic trips a
 * foreign-key violation (23503) via the FKs / composite FK — the service
 * pre-checks for friendly errors but the DB is the ultimate guard (§3.2).
 */
export async function insertTicket(
  fields: InsertTicketFields,
  database: DbClient = defaultDb,
): Promise<TicketRow> {
  const [row] = await database
    .insert(tickets)
    .values({
      teamId: fields.teamId,
      epicId: fields.epicId,
      type: fields.type,
      state: fields.state,
      title: fields.title,
      body: fields.body,
      createdBy: fields.createdBy,
    })
    .returning();
  return row;
}

/**
 * Update a ticket's mutable fields and advance `modified_at` to `now()` in the
 * same statement. Only called by the service when a field actually changed, so
 * `modified_at` advances on real change only (§3.1, §4.6). `created_by` /
 * `created_at` are never part of the SET clause.
 */
export async function updateTicket(
  id: string,
  fields: UpdateTicketFields,
  database: DbClient = defaultDb,
): Promise<TicketRow | undefined> {
  const [row] = await database
    .update(tickets)
    .set({
      teamId: fields.teamId,
      epicId: fields.epicId,
      type: fields.type,
      state: fields.state,
      title: fields.title,
      body: fields.body,
      modifiedAt: new Date(),
    })
    .where(eq(tickets.id, id))
    .returning();
  return row;
}

/**
 * Update only a ticket's `state` and advance `modified_at` to `now()` in the
 * same statement (the dedicated drag-and-drop endpoint, §4.6 state). The service
 * only calls this when the state actually changes, so `modified_at` advances on
 * real change only (§2.8). Returns the updated row, or `undefined` if the ticket
 * was deleted between the service's read and this write.
 */
export async function updateTicketState(
  id: string,
  state: TicketState,
  database: DbClient = defaultDb,
): Promise<TicketRow | undefined> {
  const [row] = await database
    .update(tickets)
    .set({ state, modifiedAt: new Date() })
    .where(eq(tickets.id, id))
    .returning();
  return row;
}

/** Delete a ticket by id, returning `true` if a row was removed. Comments are
 * removed by the `comments.ticket_id` CASCADE FK (§3.3). */
export async function deleteTicket(
  id: string,
  database: DbClient = defaultDb,
): Promise<boolean> {
  const rows = await database
    .delete(tickets)
    .where(eq(tickets.id, id))
    .returning({ id: tickets.id });
  return rows.length > 0;
}

/** A board card row: the compact fields the board renders per ticket (§4.8). */
export interface BoardCardRow {
  id: string;
  title: string;
  type: TicketType;
  state: TicketState;
  epicTitle: string | null;
  modifiedAt: Date;
}

/** Filters accepted by the board query; all optional and combined with AND (§4.8). */
export interface BoardFilters {
  type?: TicketType;
  epicId?: string;
  /** Case-insensitive substring matched against `title` (§4.8). */
  q?: string;
}

/**
 * Fetch every ticket for a team as board cards (§4.8), applying the optional
 * `type` / `epicId` / `q` filters (combined with AND) and ordering by
 * `state` then `modified_at DESC`. The service groups the flat result into the
 * five state columns; a single ordered query keeps this index-friendly and
 * usable at 100+ tickets:
 *
 *   - `type` / `epicId` equality + the `state, modified_at DESC` ordering are
 *     served by `tickets_team_state_modified_idx` (§3.5),
 *   - the case-insensitive substring `q` uses `title ILIKE %q%` (equivalently
 *     `lower(title) LIKE lower('%q%')`), which the trigram GIN index on
 *     `lower(title)` supports (§3.5).
 *
 * `epicTitle` comes from a LEFT JOIN to `epics` so unassigned tickets keep a
 * `null` title. Ordering by `state` is only to make grouping deterministic; the
 * within-column recency order is the `modified_at DESC` key the board needs.
 */
export async function listBoardCards(
  teamId: string,
  filters: BoardFilters = {},
  database: DbClient = defaultDb,
): Promise<BoardCardRow[]> {
  const conditions: SQL[] = [eq(tickets.teamId, teamId)];
  if (filters.type !== undefined) {
    conditions.push(eq(tickets.type, filters.type));
  }
  if (filters.epicId !== undefined) {
    conditions.push(eq(tickets.epicId, filters.epicId));
  }
  if (filters.q !== undefined && filters.q.length > 0) {
    // ILIKE is case-insensitive; escape LIKE metacharacters in the user input so
    // `%`/`_`/`\` are matched literally (substring search, not a pattern).
    const escaped = filters.q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    conditions.push(ilike(tickets.title, sql`${`%${escaped}%`}`));
  }

  return database
    .select({
      id: tickets.id,
      title: tickets.title,
      type: tickets.type,
      state: tickets.state,
      epicTitle: epics.title,
      modifiedAt: tickets.modifiedAt,
    })
    .from(tickets)
    .leftJoin(epics, eq(epics.id, tickets.epicId))
    .where(and(...conditions))
    .orderBy(asc(tickets.state), desc(tickets.modifiedAt));
}

/** Check a team exists (used by the create pre-check for a friendly 404). */
export async function teamExists(
  teamId: string,
  database: DbClient = defaultDb,
): Promise<boolean> {
  const rows = await database
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Look up an epic by id, returning its `teamId` (or `undefined` if missing).
 * Used by the service to enforce the cross-team epic rule before the write.
 */
export async function findEpicTeam(
  epicId: string,
  database: DbClient = defaultDb,
): Promise<{ id: string; teamId: string } | undefined> {
  const rows = await database
    .select({ id: epics.id, teamId: epics.teamId })
    .from(epics)
    .where(eq(epics.id, epicId))
    .limit(1);
  return rows[0];
}

/**
 * Check that an epic exists AND belongs to `teamId` (the cross-team epic rule,
 * §3.2). A helper kept for symmetry / direct probing; the service uses
 * {@link findEpicTeam} so it can distinguish "missing epic" from "wrong team".
 */
export async function epicBelongsToTeam(
  epicId: string,
  teamId: string,
  database: DbClient = defaultDb,
): Promise<boolean> {
  const rows = await database
    .select({ id: epics.id })
    .from(epics)
    .where(and(eq(epics.id, epicId), eq(epics.teamId, teamId)))
    .limit(1);
  return rows.length > 0;
}
