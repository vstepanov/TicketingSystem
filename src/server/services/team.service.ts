/**
 * Team service (business rules for team CRUD, plan §4.4).
 *
 * Server-side validation is authoritative:
 *
 *   - names are trimmed and must be non-empty (400 otherwise),
 *   - names are unique case-insensitively — `"Payments"` collides with
 *     `"payments"` (409 on create; 409 on rename, excluding self),
 *   - rename advances `modified_at` ONLY when the name actually changes; a no-op
 *     rename returns the team untouched (§3.1, §4.4),
 *   - delete is REJECTED with 409 (`TEAM_NOT_EMPTY`) when the team has any
 *     tickets or epics — cascading team delete is forbidden (§3.3).
 *
 * The DB is the ultimate guard: uniqueness is a UNIQUE citext constraint and the
 * non-empty rule is a CHECK; delete is blocked by FK RESTRICT. We pre-check for
 * friendly messages, then rely on {@link toAppError} (which walks the driver
 * error's `cause` chain) to map any 23505/23503 that slips through to 409 — so
 * the conflict is correct even under a race and even when Drizzle wraps the
 * driver error inside a transaction.
 */
import { z } from "zod";

import { db as defaultDb, type Database } from "@/server/db/client";
import { conflictError, notFoundError, toAppError } from "@/server/http/errors";
import { parseOrThrow, trimmedString } from "@/lib/validation";
import * as teamRepo from "@/server/repositories/team.repo";

/** Create/rename input schema: a single trimmed, non-empty `name` (§4.4). */
export const teamNameSchema = z.object({
  name: trimmedString("Team name is required"),
});

/** The public team object returned by the API (§4.4). */
export interface TeamView {
  id: string;
  name: string;
  createdAt: Date;
  modifiedAt: Date;
  ticketCount: number;
  epicCount: number;
  canDelete: boolean;
}

/** Shape a counted repo row into the public view (canDelete = no references). */
function toView(row: teamRepo.TeamWithCounts): TeamView {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
    ticketCount: row.ticketCount,
    epicCount: row.epicCount,
    canDelete: row.ticketCount === 0 && row.epicCount === 0,
  };
}

/**
 * List all teams (with counts + canDelete), sorted by name (§4.4 GET /api/teams).
 */
export async function listTeams(
  database: Database = defaultDb,
): Promise<TeamView[]> {
  const rows = await teamRepo.listTeamsWithCounts(database);
  return rows.map(toView);
}

/**
 * Create a team (§4.4 POST /api/teams).
 *
 * @throws AppError 400 on an empty/whitespace name, 409 on a case-insensitive
 *   duplicate name.
 */
export async function createTeam(
  input: unknown,
  database: Database = defaultDb,
): Promise<TeamView> {
  const { name } = parseOrThrow(teamNameSchema, input);

  // Pre-check for a friendly 409; the UNIQUE constraint is the real guard.
  const existing = await teamRepo.findTeamByName(name, undefined, database);
  if (existing !== undefined) {
    throw conflictError("A team with this name already exists");
  }

  let created: teamRepo.TeamRow;
  try {
    created = await teamRepo.insertTeam(name, database);
  } catch (error) {
    // 23505 (unique) → 409, even under a race between the pre-check and insert.
    throw toAppError(error);
  }

  return {
    id: created.id,
    name: created.name,
    createdAt: created.createdAt,
    modifiedAt: created.modifiedAt,
    ticketCount: 0,
    epicCount: 0,
    canDelete: true,
  };
}

/**
 * Rename a team (§4.4 PATCH /api/teams/{id}).
 *
 * `modified_at` advances ONLY if the trimmed new name differs from the current
 * one; a no-op rename returns the existing team unchanged. Uniqueness is checked
 * case-insensitively, excluding the team itself.
 *
 * @throws AppError 400 empty name, 404 unknown id, 409 duplicate name.
 */
export async function renameTeam(
  id: string,
  input: unknown,
  database: Database = defaultDb,
): Promise<TeamView> {
  const { name } = parseOrThrow(teamNameSchema, input);

  const current = await teamRepo.findTeamById(id, database);
  if (current === undefined) {
    throw notFoundError("Team not found");
  }

  // No-op detection: `teams.name` is citext, so a pure case change ("Payments"
  // -> "payments") is still the SAME name and must NOT advance modified_at.
  if (current.name.toLowerCase() === name.toLowerCase()) {
    return await buildViewFor(id, current, database);
  }

  const clash = await teamRepo.findTeamByName(name, id, database);
  if (clash !== undefined) {
    throw conflictError("A team with this name already exists");
  }

  let updated: teamRepo.TeamRow | undefined;
  try {
    updated = await teamRepo.updateTeamName(id, name, database);
  } catch (error) {
    throw toAppError(error);
  }
  if (updated === undefined) {
    // Deleted between the read and the update.
    throw notFoundError("Team not found");
  }

  return await buildViewFor(id, updated, database);
}

/**
 * Delete a team (§4.4 DELETE /api/teams/{id}).
 *
 * Rejects with 409 `TEAM_NOT_EMPTY` when the team has any tickets or epics
 * (cascading team delete is forbidden). The count pre-check yields the friendly
 * message; if the delete still trips FK RESTRICT (23503) — e.g. a ticket created
 * concurrently — {@link toAppError} maps it to 409, so the response is correct
 * even under the real, possibly-wrapped driver error shape.
 *
 * @throws AppError 404 unknown id, 409 when the team is non-empty.
 */
export async function deleteTeam(
  id: string,
  database: Database = defaultDb,
): Promise<void> {
  const team = await teamRepo.findTeamById(id, database);
  if (team === undefined) {
    throw notFoundError("Team not found");
  }

  const { ticketCount, epicCount } = await teamRepo.countTeamReferences(
    id,
    database,
  );
  if (ticketCount > 0 || epicCount > 0) {
    throw conflictError(
      "Team cannot be deleted while it still has tickets or epics",
    );
  }

  try {
    const removed = await teamRepo.deleteTeam(id, database);
    if (!removed) {
      throw notFoundError("Team not found");
    }
  } catch (error) {
    // A concurrent insert of a ticket/epic could make the DELETE trip FK
    // RESTRICT (23503) despite the pre-check → 409, not a leaked 500.
    throw toAppError(error);
  }
}

/**
 * Re-read the team's counts and shape a view. Used by rename to return an
 * accurate `ticketCount`/`epicCount`/`canDelete` for the (possibly updated) row.
 */
async function buildViewFor(
  id: string,
  row: teamRepo.TeamRow,
  database: Database,
): Promise<TeamView> {
  const { ticketCount, epicCount } = await teamRepo.countTeamReferences(
    id,
    database,
  );
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
    ticketCount,
    epicCount,
    canDelete: ticketCount === 0 && epicCount === 0,
  };
}
