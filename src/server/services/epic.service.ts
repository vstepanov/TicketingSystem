/**
 * Epic service (business rules for epic CRUD, plan §4.5).
 *
 * Server-side validation is authoritative:
 *
 *   - `teamId` (a UUID) is required on create; the team must exist (404) and is
 *     set once — it is IMMUTABLE thereafter. PATCH rejects any `teamId` in the
 *     body with 400, so an attempt to move an epic between teams never succeeds
 *     (§3.2 "immutable after create", §4.5 "teamId not editable"),
 *   - titles are trimmed and must be non-empty (400 otherwise),
 *   - `description` is nullable; blank/whitespace normalises to `null`,
 *   - PATCH advances `modified_at` ONLY when a field actually changes value; a
 *     no-op edit returns the epic untouched (§3.1, §4.5),
 *   - delete is REJECTED with 409 (`EPIC_REFERENCED`) when any ticket references
 *     the epic (§3.3).
 *
 * The DB is the ultimate guard: `epics.title` has a non-empty CHECK, and delete
 * is blocked by FK RESTRICT on `tickets.epic_id`. We pre-check counts for a
 * friendly message, then rely on {@link toAppError} (which walks the driver
 * error's `cause` chain) to map any 23503/23001 that slips through to 409 — so
 * the conflict is correct even under a race and even when Drizzle wraps the
 * driver error.
 */
import { z } from "zod";

import { db as defaultDb, type Database } from "@/server/db/client";
import {
  conflictError,
  notFoundError,
  toAppError,
} from "@/server/http/errors";
import {
  optionalTrimmedString,
  parseOrThrow,
  trimmedString,
} from "@/lib/validation";
import * as epicRepo from "@/server/repositories/epic.repo";

/** A UUID string schema with a friendly message. */
function uuidField(message: string) {
  return z
    .string({ required_error: message, invalid_type_error: message })
    .uuid(message);
}

/** Create input schema (§4.5 POST /api/epics). */
export const createEpicSchema = z.object({
  teamId: uuidField("A valid teamId is required"),
  title: trimmedString("Title is required"),
  description: optionalTrimmedString(),
});

/**
 * Update input schema (§4.5 PATCH /api/epics/{id}).
 *
 * `teamId` is NOT editable, so it is `.strict()`-rejected: any `teamId` key in
 * the body triggers a 400 (explicit rejection was chosen over silent ignore so
 * a client that tries to move an epic gets clear feedback). `title` is validated
 * non-empty only when present; `description` may be set to `null`.
 */
export const updateEpicSchema = z
  .object({
    title: trimmedString("Title is required").optional(),
    description: optionalTrimmedString(),
  })
  .strict("teamId is not editable");

/** The public epic object returned by the API (§4.5). */
export interface EpicView {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  createdAt: Date;
  modifiedAt: Date;
  ticketCount: number;
  canDelete: boolean;
}

/** Shape a counted repo row into the public view (canDelete = no tickets). */
function toView(row: epicRepo.EpicWithCount): EpicView {
  return {
    id: row.id,
    teamId: row.teamId,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
    ticketCount: row.ticketCount,
    canDelete: row.ticketCount === 0,
  };
}

/**
 * List a team's epics (with ticketCount + canDelete), sorted by title
 * (§4.5 GET /api/epics?teamId).
 *
 * @throws AppError 400 when `teamId` is missing or not a UUID.
 */
export async function listEpics(
  teamId: unknown,
  database: Database = defaultDb,
): Promise<EpicView[]> {
  const parsed = parseOrThrow(
    z.object({ teamId: uuidField("A valid teamId is required") }),
    { teamId },
  );
  const rows = await epicRepo.listEpicsByTeamWithCounts(parsed.teamId, database);
  return rows.map(toView);
}

/**
 * Create an epic under a team (§4.5 POST /api/epics).
 *
 * The team is set here and never changes afterward. A missing team yields 404
 * (pre-checked for a friendly message; the FK RESTRICT is the real guard).
 *
 * @throws AppError 400 on invalid input (bad teamId / empty title), 404 when the
 *   team does not exist.
 */
export async function createEpic(
  input: unknown,
  database: Database = defaultDb,
): Promise<EpicView> {
  const { teamId, title, description } = parseOrThrow(createEpicSchema, input);

  // Pre-check for a friendly 404; the FK RESTRICT on team_id is the real guard.
  const exists = await epicRepo.teamExists(teamId, database);
  if (!exists) {
    throw notFoundError("Team not found");
  }

  let created: epicRepo.EpicRow;
  try {
    created = await epicRepo.insertEpic(
      { teamId, title, description },
      database,
    );
  } catch (error) {
    // A team deleted between the pre-check and insert trips FK 23503; but a
    // missing parent on insert means the team is gone → 404, not 409.
    const mapped = toAppError(error);
    if (mapped.code === "CONFLICT") {
      throw notFoundError("Team not found");
    }
    throw mapped;
  }

  return {
    id: created.id,
    teamId: created.teamId,
    title: created.title,
    description: created.description,
    createdAt: created.createdAt,
    modifiedAt: created.modifiedAt,
    ticketCount: 0,
    canDelete: true,
  };
}

/**
 * Update an epic's title/description (§4.5 PATCH /api/epics/{id}).
 *
 * `teamId` is not editable — a `teamId` in the body is rejected with 400 by the
 * schema. `modified_at` advances ONLY if a field's value actually changes; a
 * no-op edit returns the existing epic unchanged.
 *
 * @throws AppError 400 invalid input (incl. teamId present, empty title), 404
 *   unknown id.
 */
export async function updateEpic(
  id: string,
  input: unknown,
  database: Database = defaultDb,
): Promise<EpicView> {
  const patch = parseOrThrow(updateEpicSchema, input);

  const current = await epicRepo.findEpicById(id, database);
  if (current === undefined) {
    throw notFoundError("Epic not found");
  }

  // `optionalTrimmedString()` normalises an ABSENT description to `null`, so it
  // cannot alone distinguish "omitted" from "explicitly cleared". We therefore
  // inspect the raw body for the presence of each key: an omitted field keeps
  // the current value; a present field applies the parsed value.
  const rawKeys =
    input !== null && typeof input === "object"
      ? new Set(Object.keys(input as Record<string, unknown>))
      : new Set<string>();

  const nextTitle = rawKeys.has("title") ? patch.title! : current.title;
  const nextDescription = rawKeys.has("description")
    ? patch.description
    : current.description;

  // No-op detection: only write (and advance modified_at) if a field's resolved
  // value actually differs from what is stored.
  const titleChanged = nextTitle !== current.title;
  const descriptionChanged = nextDescription !== current.description;
  if (!titleChanged && !descriptionChanged) {
    return await buildViewFor(id, current, database);
  }

  let updated: epicRepo.EpicRow | undefined;
  try {
    updated = await epicRepo.updateEpic(
      id,
      { title: nextTitle, description: nextDescription },
      database,
    );
  } catch (error) {
    throw toAppError(error);
  }
  if (updated === undefined) {
    // Deleted between the read and the update.
    throw notFoundError("Epic not found");
  }

  return await buildViewFor(id, updated, database);
}

/**
 * Delete an epic (§4.5 DELETE /api/epics/{id}).
 *
 * Rejects with 409 `EPIC_REFERENCED` when any ticket references the epic. The
 * count pre-check yields the friendly message; if the delete still trips FK
 * RESTRICT (23503/23001) — e.g. a ticket created concurrently — {@link toAppError}
 * maps it to 409, so the response is correct even under the real, possibly
 * wrapped driver error shape.
 *
 * @throws AppError 404 unknown id, 409 when tickets reference the epic.
 */
export async function deleteEpic(
  id: string,
  database: Database = defaultDb,
): Promise<void> {
  const epic = await epicRepo.findEpicById(id, database);
  if (epic === undefined) {
    throw notFoundError("Epic not found");
  }

  const ticketCount = await epicRepo.countEpicReferences(id, database);
  if (ticketCount > 0) {
    throw conflictError("Epic cannot be deleted while tickets reference it");
  }

  try {
    const removed = await epicRepo.deleteEpic(id, database);
    if (!removed) {
      throw notFoundError("Epic not found");
    }
  } catch (error) {
    // A concurrent ticket insert could make the DELETE trip FK RESTRICT → 409,
    // not a leaked 500.
    throw toAppError(error);
  }
}

/**
 * Re-read the epic's ticket count and shape a view. Used to return an accurate
 * `ticketCount`/`canDelete` for the (possibly updated) row.
 */
async function buildViewFor(
  id: string,
  row: epicRepo.EpicRow,
  database: Database,
): Promise<EpicView> {
  const ticketCount = await epicRepo.countEpicReferences(id, database);
  return {
    id: row.id,
    teamId: row.teamId,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
    ticketCount,
    canDelete: ticketCount === 0,
  };
}
