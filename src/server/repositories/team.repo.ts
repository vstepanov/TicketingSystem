/**
 * Team repository (persistence tier, plan §4 layering).
 *
 * All Drizzle access to the `teams` table (plus the `tickets`/`epics` count
 * sub-queries that drive `canDelete`) lives here so the service never touches SQL
 * directly. Every function takes the Drizzle client explicitly (the shared app
 * client by default) so callers can pass a transaction handle or an ephemeral
 * test client.
 *
 * `teams.name` is a `citext` column, so equality and the UNIQUE constraint are
 * both case-insensitive: `"Payments"` and `"payments"` collide (§3.1, §3.2).
 */
import { and, asc, count, countDistinct, eq, ne } from "drizzle-orm";

import { db as defaultDb, type DbClient } from "@/server/db/client";
import { epics, teams, tickets } from "@/server/db/schema";

/** A persisted team row (all columns). */
export interface TeamRow {
  id: string;
  name: string;
  createdAt: Date;
  modifiedAt: Date;
}

/** A team row enriched with reference counts (drives `canDelete`). */
export interface TeamWithCounts extends TeamRow {
  ticketCount: number;
  epicCount: number;
}

/**
 * List every team with its ticket + epic counts, sorted by name (§4.4).
 *
 * Uses LEFT JOINs to both child tables and `countDistinct(child.id)` under a
 * `GROUP BY team`. LEFT JOIN keeps teams with zero tickets/epics in the result
 * (their counts come back 0), and `countDistinct` prevents the cartesian
 * inflation that a plain `count()` would suffer when a team has both several
 * tickets and several epics (the join multiplies rows). Postgres `count()`
 * returns a `bigint`; drizzle's `count`/`countDistinct` helpers already coerce to
 * `number`.
 */
export async function listTeamsWithCounts(
  database: DbClient = defaultDb,
): Promise<TeamWithCounts[]> {
  const rows = await database
    .select({
      id: teams.id,
      name: teams.name,
      createdAt: teams.createdAt,
      modifiedAt: teams.modifiedAt,
      ticketCount: countDistinct(tickets.id),
      epicCount: countDistinct(epics.id),
    })
    .from(teams)
    .leftJoin(tickets, eq(tickets.teamId, teams.id))
    .leftJoin(epics, eq(epics.teamId, teams.id))
    .groupBy(teams.id, teams.name, teams.createdAt, teams.modifiedAt)
    .orderBy(asc(teams.name));

  return rows.map((r) => ({
    ...r,
    ticketCount: Number(r.ticketCount),
    epicCount: Number(r.epicCount),
  }));
}

/** Look up a single team by id (all columns), or `undefined`. */
export async function findTeamById(
  id: string,
  database: DbClient = defaultDb,
): Promise<TeamRow | undefined> {
  const rows = await database
    .select()
    .from(teams)
    .where(eq(teams.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Find a team by (case-insensitive) name, optionally excluding one id. Used for
 * pre-emptive duplicate detection so the service can return a friendly 409 before
 * hitting the UNIQUE constraint. `name` is `citext` → the match is
 * case-insensitive by construction. Pass `excludeId` for rename collision checks.
 */
export async function findTeamByName(
  name: string,
  excludeId: string | undefined,
  database: DbClient = defaultDb,
): Promise<TeamRow | undefined> {
  const predicate =
    excludeId === undefined
      ? eq(teams.name, name)
      : and(eq(teams.name, name), ne(teams.id, excludeId));
  const rows = await database
    .select()
    .from(teams)
    .where(predicate)
    .limit(1);
  return rows[0];
}

/**
 * Insert a new team. A duplicate name (case-insensitive) trips the UNIQUE
 * constraint (23505); the caller maps it to a 409.
 */
export async function insertTeam(
  name: string,
  database: DbClient = defaultDb,
): Promise<TeamRow> {
  const [row] = await database.insert(teams).values({ name }).returning();
  return row;
}

/**
 * Update a team's name and advance `modified_at` to `now()` in the same
 * statement. Only called by the service when the name actually changed, so
 * `modified_at` advances on real change only (§3.1, §4.4).
 */
export async function updateTeamName(
  id: string,
  name: string,
  database: DbClient = defaultDb,
): Promise<TeamRow | undefined> {
  const [row] = await database
    .update(teams)
    .set({ name, modifiedAt: new Date() })
    .where(eq(teams.id, id))
    .returning();
  return row;
}

/**
 * Delete a team by id, returning `true` if a row was removed. FK RESTRICT on
 * `epics.team_id` / `tickets.team_id` makes Postgres reject the delete (23503)
 * when the team still has epics or tickets — the service pre-checks counts for a
 * friendly message but the DB is the ultimate guard (§3.3).
 */
export async function deleteTeam(
  id: string,
  database: DbClient = defaultDb,
): Promise<boolean> {
  const rows = await database
    .delete(teams)
    .where(eq(teams.id, id))
    .returning({ id: teams.id });
  return rows.length > 0;
}

/** Count tickets + epics referencing a team (drives the delete pre-check). */
export async function countTeamReferences(
  id: string,
  database: DbClient = defaultDb,
): Promise<{ ticketCount: number; epicCount: number }> {
  const [ticketRow] = await database
    .select({ value: count() })
    .from(tickets)
    .where(eq(tickets.teamId, id));
  const [epicRow] = await database
    .select({ value: count() })
    .from(epics)
    .where(eq(epics.teamId, id));
  return {
    ticketCount: Number(ticketRow?.value ?? 0),
    epicCount: Number(epicRow?.value ?? 0),
  };
}
