/**
 * Epic repository (persistence tier, plan §4 layering).
 *
 * All Drizzle access to the `epics` table (plus the `tickets` count sub-query
 * that drives `canDelete`) lives here so the service never touches SQL directly.
 * Every function takes the Drizzle client explicitly (the shared app client by
 * default) so callers can pass a transaction handle or an ephemeral test client.
 *
 * An epic's `team_id` is set at insert and never updated here: no function
 * mutates it, which — together with FK RESTRICT on `epics.team_id` (§3.2) —
 * keeps the team immutable after create.
 */
import { asc, count, countDistinct, eq } from "drizzle-orm";

import { db as defaultDb, type DbClient } from "@/server/db/client";
import { epics, teams, tickets } from "@/server/db/schema";

/** A persisted epic row (all columns). */
export interface EpicRow {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  createdAt: Date;
  modifiedAt: Date;
}

/** An epic row enriched with its referencing-ticket count (drives `canDelete`). */
export interface EpicWithCount extends EpicRow {
  ticketCount: number;
}

/**
 * List every epic for a team with its referencing-ticket count, sorted by
 * title (§4.5 GET /api/epics).
 *
 * Uses a LEFT JOIN to `tickets` under a `GROUP BY epic` so epics with zero
 * tickets stay in the result (count comes back 0). `countDistinct(tickets.id)`
 * yields a `number` (drizzle coerces the Postgres `bigint`).
 */
export async function listEpicsByTeamWithCounts(
  teamId: string,
  database: DbClient = defaultDb,
): Promise<EpicWithCount[]> {
  const rows = await database
    .select({
      id: epics.id,
      teamId: epics.teamId,
      title: epics.title,
      description: epics.description,
      createdAt: epics.createdAt,
      modifiedAt: epics.modifiedAt,
      ticketCount: countDistinct(tickets.id),
    })
    .from(epics)
    .leftJoin(tickets, eq(tickets.epicId, epics.id))
    .where(eq(epics.teamId, teamId))
    .groupBy(
      epics.id,
      epics.teamId,
      epics.title,
      epics.description,
      epics.createdAt,
      epics.modifiedAt,
    )
    .orderBy(asc(epics.title));

  return rows.map((r) => ({ ...r, ticketCount: Number(r.ticketCount) }));
}

/** Look up a single epic by id (all columns), or `undefined`. */
export async function findEpicById(
  id: string,
  database: DbClient = defaultDb,
): Promise<EpicRow | undefined> {
  const rows = await database
    .select()
    .from(epics)
    .where(eq(epics.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Insert a new epic under `teamId`. A missing team trips FK RESTRICT (23503);
 * the service pre-checks for a friendly 404 but the DB is the ultimate guard.
 * `team_id` is only ever set here, never updated → immutable after create.
 */
export async function insertEpic(
  input: { teamId: string; title: string; description: string | null },
  database: DbClient = defaultDb,
): Promise<EpicRow> {
  const [row] = await database
    .insert(epics)
    .values({
      teamId: input.teamId,
      title: input.title,
      description: input.description,
    })
    .returning();
  return row;
}

/**
 * Update an epic's `title`/`description` and advance `modified_at` to `now()` in
 * the same statement. Only called by the service when a field actually changed,
 * so `modified_at` advances on real change only (§3.1, §4.5). `team_id` is never
 * part of the SET clause — the team is immutable.
 */
export async function updateEpic(
  id: string,
  fields: { title: string; description: string | null },
  database: DbClient = defaultDb,
): Promise<EpicRow | undefined> {
  const [row] = await database
    .update(epics)
    .set({
      title: fields.title,
      description: fields.description,
      modifiedAt: new Date(),
    })
    .where(eq(epics.id, id))
    .returning();
  return row;
}

/**
 * Delete an epic by id, returning `true` if a row was removed. FK RESTRICT on
 * `tickets.epic_id` makes Postgres reject the delete (23503) when tickets still
 * reference the epic — the service pre-checks counts for a friendly message but
 * the DB is the ultimate guard (§3.3).
 */
export async function deleteEpic(
  id: string,
  database: DbClient = defaultDb,
): Promise<boolean> {
  const rows = await database
    .delete(epics)
    .where(eq(epics.id, id))
    .returning({ id: epics.id });
  return rows.length > 0;
}

/** Count tickets referencing an epic (drives the delete pre-check + canDelete). */
export async function countEpicReferences(
  id: string,
  database: DbClient = defaultDb,
): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(tickets)
    .where(eq(tickets.epicId, id));
  return Number(row?.value ?? 0);
}

/**
 * Check a team exists (used by the create pre-check for a friendly 404 before
 * the FK RESTRICT on `epics.team_id` would fire on insert).
 */
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
