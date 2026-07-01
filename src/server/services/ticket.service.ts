/**
 * Ticket service (business rules for ticket CRUD, plan §4.6).
 *
 * Server-side validation is authoritative:
 *
 *   - `teamId` is required on create; the team must exist (404 else). `type` and
 *     `state` are validated against the native enum values (§3.4) and rejected
 *     with 400 before they reach the DB (defense in depth); `state` defaults to
 *     `new`. `title`/`body` are trimmed and must be non-empty (400 otherwise).
 *   - CROSS-TEAM EPIC RULE (§3.2): if `epicId` is set, the epic must exist AND
 *     belong to the ticket's team, else 400. This is enforced BOTH by a service
 *     pre-check (friendly 400) AND the DB composite FK
 *     `tickets(epic_id, team_id) -> epics(id, team_id)` as a backstop. A
 *     cross-team epic is a VALIDATION error, so any residual composite-FK
 *     violation on write is mapped to 400 (not the generic 409 that
 *     {@link toAppError} would assign to a 23503) — see {@link mapWriteError}.
 *   - `created_by` comes from the session (never the client).
 *   - PATCH: enums validated; non-empty title/body when present; if `teamId`
 *     changes, `epicId` must be null OR belong to the new team (mismatch → 400).
 *     `modified_at` advances ONLY when a field's value actually changes; a no-op
 *     save returns the ticket untouched (§3.1, §4.6).
 *   - DELETE cascades comments via the `comments.ticket_id` CASCADE FK (§3.3).
 */
import { z } from "zod";

import { db as defaultDb, type Database } from "@/server/db/client";
import {
  AppError,
  notFoundError,
  toAppError,
  validationError,
} from "@/server/http/errors";
import { parseOrThrow, trimmedString } from "@/lib/validation";
import { ticketStateEnum, ticketTypeEnum } from "@/server/db/schema";
import * as ticketRepo from "@/server/repositories/ticket.repo";

/** A UUID string schema with a friendly message. */
function uuidField(message: string) {
  return z
    .string({ required_error: message, invalid_type_error: message })
    .uuid(message);
}

/** `type` enum schema built from the pgEnum values (§3.4, defense in depth). */
const typeField = z.enum(ticketTypeEnum.enumValues, {
  required_error: "A valid type is required",
  invalid_type_error: "A valid type is required",
});

/** `state` enum schema built from the pgEnum values (§3.4, defense in depth). */
const stateField = z.enum(ticketStateEnum.enumValues, {
  required_error: "A valid state is required",
  invalid_type_error: "A valid state is required",
});

/** Nullable-optional epicId: absent → undefined, explicit null allowed. */
const epicIdField = uuidField("A valid epicId is required")
  .nullable()
  .optional();

/** Create input schema (§4.6 POST /api/tickets). `state` defaults to `new`. */
export const createTicketSchema = z.object({
  teamId: uuidField("A valid teamId is required"),
  type: typeField,
  title: trimmedString("Title is required"),
  body: trimmedString("Body is required"),
  state: stateField.optional(),
  epicId: epicIdField,
});

/** Update input schema (§4.6 PATCH /api/tickets/{id}); all fields optional. */
export const updateTicketSchema = z
  .object({
    teamId: uuidField("A valid teamId is required").optional(),
    type: typeField.optional(),
    title: trimmedString("Title is required").optional(),
    body: trimmedString("Body is required").optional(),
    state: stateField.optional(),
    epicId: epicIdField,
  })
  .strict("Unknown field in request body");

/** The public ticket object returned by create/patch (§4.6). */
export interface TicketView {
  id: string;
  teamId: string;
  epicId: string | null;
  type: ticketRepo.TicketType;
  state: ticketRepo.TicketState;
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  modifiedAt: Date;
}

/** The detail view (§4.6 GET): full ticket + author email + epic title. */
export interface TicketDetailView extends TicketView {
  authorEmail: string;
  epicTitle: string | null;
}

/** Shape a bare ticket row into the public view. */
function toView(row: ticketRepo.TicketRow): TicketView {
  return {
    id: row.id,
    teamId: row.teamId,
    epicId: row.epicId,
    type: row.type,
    state: row.state,
    title: row.title,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
  };
}

/**
 * Map a write (insert/update) error to an {@link AppError}.
 *
 * Every valid reference is pre-checked before the write, so a residual
 * foreign-key/restrict violation (23503/23001) on a ticket write means an epic
 * that is missing or belongs to another team (a cross-team epic) slipped through
 * under concurrency. Per §4.6 a cross-team epic is a VALIDATION error, so we map
 * it to 400 — overriding {@link toAppError}'s default 409 for those SQLSTATEs.
 */
function mapWriteError(error: unknown): AppError {
  const mapped = toAppError(error);
  if (mapped.code === "CONFLICT") {
    return validationError(
      "epicId does not reference an epic in the ticket's team",
      { epicId: "Epic must belong to the ticket's team" },
    );
  }
  return mapped;
}

/**
 * Verify the cross-team epic rule for `epicId` under `teamId` (§3.2).
 *
 * @throws AppError 400 when the epic is missing or belongs to another team.
 */
async function assertEpicInTeam(
  epicId: string,
  teamId: string,
  database: Database,
): Promise<void> {
  const epic = await ticketRepo.findEpicTeam(epicId, database);
  if (epic === undefined || epic.teamId !== teamId) {
    throw validationError(
      "epicId does not reference an epic in the ticket's team",
      { epicId: "Epic must belong to the ticket's team" },
    );
  }
}

/**
 * Create a ticket (§4.6 POST /api/tickets).
 *
 * @param createdBy The session user's id (authoritative — never from the body).
 * @throws AppError 400 bad enum / empty / cross-team epic, 404 team/epic missing.
 */
export async function createTicket(
  input: unknown,
  createdBy: string,
  database: Database = defaultDb,
): Promise<TicketView> {
  const parsed = parseOrThrow(createTicketSchema, input);
  const { teamId, type, title, body } = parsed;
  const state = parsed.state ?? "new";
  const epicId = parsed.epicId ?? null;

  // Pre-check the team for a friendly 404 (FK RESTRICT is the real guard).
  const team = await ticketRepo.teamExists(teamId, database);
  if (!team) {
    throw notFoundError("Team not found");
  }

  // Cross-team epic pre-check → 400 (the composite FK is the DB backstop).
  if (epicId !== null) {
    await assertEpicInTeam(epicId, teamId, database);
  }

  let created: ticketRepo.TicketRow;
  try {
    created = await ticketRepo.insertTicket(
      { teamId, epicId, type, state, title, body, createdBy },
      database,
    );
  } catch (error) {
    throw mapWriteError(error);
  }

  return toView(created);
}

/**
 * Get a ticket with author email + epic title (§4.6 GET /api/tickets/{id}).
 *
 * @throws AppError 404 when the ticket does not exist.
 */
export async function getTicket(
  id: string,
  database: Database = defaultDb,
): Promise<TicketDetailView> {
  const row = await ticketRepo.findTicketDetailById(id, database);
  if (row === undefined) {
    throw notFoundError("Ticket not found");
  }
  return {
    id: row.id,
    teamId: row.teamId,
    epicId: row.epicId,
    type: row.type,
    state: row.state,
    title: row.title,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
    authorEmail: row.authorEmail,
    epicTitle: row.epicTitle,
  };
}

/**
 * Update a ticket (§4.6 PATCH /api/tickets/{id}).
 *
 * Only present keys are applied; omitted fields keep their stored value. When
 * `teamId` changes, the resolved `epicId` must be null or belong to the new team
 * (mismatch → 400). `modified_at` advances ONLY if a field's resolved value
 * actually differs from what is stored (no-op → ticket returned unchanged).
 *
 * @throws AppError 400 bad enum / empty / cross-team epic, 404 unknown id.
 */
export async function updateTicket(
  id: string,
  input: unknown,
  database: Database = defaultDb,
): Promise<TicketView> {
  const patch = parseOrThrow(updateTicketSchema, input);

  const current = await ticketRepo.findTicketById(id, database);
  if (current === undefined) {
    throw notFoundError("Ticket not found");
  }

  // Only keys explicitly present in the raw body are applied; `epicId: null`
  // must be distinguishable from an omitted `epicId`, so inspect raw keys.
  const rawKeys =
    input !== null && typeof input === "object"
      ? new Set(Object.keys(input as Record<string, unknown>))
      : new Set<string>();

  const nextTeamId = rawKeys.has("teamId") ? patch.teamId! : current.teamId;
  const nextType = rawKeys.has("type") ? patch.type! : current.type;
  const nextState = rawKeys.has("state") ? patch.state! : current.state;
  const nextTitle = rawKeys.has("title") ? patch.title! : current.title;
  const nextBody = rawKeys.has("body") ? patch.body! : current.body;
  const nextEpicId = rawKeys.has("epicId")
    ? (patch.epicId ?? null)
    : current.epicId;

  // Cross-team epic pre-check → 400. Runs whenever the ticket ends up with a
  // non-null epic (covers a team change that leaves a stale epic, and a direct
  // epic change), so a mismatch is rejected before the write (§4.6).
  if (nextEpicId !== null) {
    await assertEpicInTeam(nextEpicId, nextTeamId, database);
  }

  // No-op detection: only write (and advance modified_at) if some field's
  // resolved value actually differs from what is stored.
  const changed =
    nextTeamId !== current.teamId ||
    nextType !== current.type ||
    nextState !== current.state ||
    nextTitle !== current.title ||
    nextBody !== current.body ||
    nextEpicId !== current.epicId;

  if (!changed) {
    return toView(current);
  }

  let updated: ticketRepo.TicketRow | undefined;
  try {
    updated = await ticketRepo.updateTicket(
      id,
      {
        teamId: nextTeamId,
        epicId: nextEpicId,
        type: nextType,
        state: nextState,
        title: nextTitle,
        body: nextBody,
      },
      database,
    );
  } catch (error) {
    throw mapWriteError(error);
  }
  if (updated === undefined) {
    // Deleted between the read and the update.
    throw notFoundError("Ticket not found");
  }

  return toView(updated);
}

/** State-only patch schema for the drag-and-drop endpoint (§4.6 state). */
export const updateTicketStateSchema = z
  .object({ state: stateField })
  .strict("Unknown field in request body");

/** The compact payload the state endpoint returns so the board can re-sort. */
export interface TicketStateView {
  id: string;
  state: ticketRepo.TicketState;
  modifiedAt: Date;
}

/**
 * Update a ticket's state via the dedicated drag-and-drop endpoint
 * (§4.6 `PATCH /api/tickets/{id}/state`).
 *
 * The state enum is validated (400 on an invalid/missing value) and ANY state
 * may move to ANY other state — sequential transitions are NOT enforced (§2.8).
 * The change is persisted immediately.
 *
 * `modified_at` semantics (§2.8 note "modified_at advances only on real
 * change"): when the dropped state differs from the stored state the row is
 * written and `modified_at` advances to `now()`; when the dropped state equals
 * the current state the update is a safe no-op — the ticket is returned
 * untouched (no spurious `modified_at` bump). This keeps the state endpoint
 * consistent with the general PATCH's real-change rule while still letting the
 * board issue the request unconditionally on any drop.
 *
 * @returns The compact `{ id, state, modifiedAt }` view (§4.6 state response).
 * @throws AppError 400 invalid/missing state, 404 unknown id.
 */
export async function updateTicketState(
  id: string,
  input: unknown,
  database: Database = defaultDb,
): Promise<TicketStateView> {
  const { state } = parseOrThrow(updateTicketStateSchema, input);

  const current = await ticketRepo.findTicketById(id, database);
  if (current === undefined) {
    throw notFoundError("Ticket not found");
  }

  // No-op-safe: dropping onto the same column changes nothing, so leave
  // modified_at untouched (§2.8 "modified_at advances only on real change").
  if (state === current.state) {
    return { id: current.id, state: current.state, modifiedAt: current.modifiedAt };
  }

  const updated = await ticketRepo.updateTicketState(id, state, database);
  if (updated === undefined) {
    // Deleted between the read and the update.
    throw notFoundError("Ticket not found");
  }

  return { id: updated.id, state: updated.state, modifiedAt: updated.modifiedAt };
}

/**
 * Delete a ticket (§4.6 DELETE /api/tickets/{id}). Its comments are removed by
 * the `comments.ticket_id` CASCADE FK (§3.3).
 *
 * @throws AppError 404 when the ticket does not exist.
 */
export async function deleteTicket(
  id: string,
  database: Database = defaultDb,
): Promise<void> {
  try {
    const removed = await ticketRepo.deleteTicket(id, database);
    if (!removed) {
      throw notFoundError("Ticket not found");
    }
  } catch (error) {
    throw toAppError(error);
  }
}
