"use client";

/**
 * Ticket + comment data hooks (plan §5.8, §5.9, §4.6, §4.7) — TanStack Query
 * bindings over the api-client for the ticket create / edit / detail screen and
 * its embedded comments panel.
 *
 * Query keys:
 *   - `ticketQueryKey(id)` — a single ticket detail (`GET /api/tickets/{id}`).
 *   - `commentsQueryKey(id)` — the ticket's comments (`GET .../comments`,
 *     oldest-first). Kept separate from the ticket query so posting a comment
 *     refetches ONLY the comments and never the ticket (the server guarantees a
 *     comment does not change the ticket's `modified_at`, §4.7/§5.9).
 *   - `teamsQueryKey` / `ticketEpicsQueryKey(teamId)` — selector data.
 *
 * Mutations invalidate the relevant queries on success (§5.3 "Success: toast +
 * cache invalidation/refetch"). Client validation is UX-only; the backend
 * re-validates everything (SHARED RULES/§4).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "@/lib/api-client";

/** Canonical ticket type enum (plan glossary / §3.4). */
export type TicketType = "bug" | "feature" | "fix";

/** Canonical ticket state enum (plan glossary / §3.4). */
export type TicketState =
  | "new"
  | "ready_for_implementation"
  | "in_progress"
  | "ready_for_acceptance"
  | "done";

/** Ordered type options for the type Select. */
export const TICKET_TYPE_ORDER: readonly TicketType[] = [
  "bug",
  "feature",
  "fix",
] as const;

/** Human labels for each type (Title-cased for the UI). */
export const TYPE_LABELS: Record<TicketType, string> = {
  bug: "Bug",
  feature: "Feature",
  fix: "Fix",
};

/** Ordered state options for the state Select (board column order). */
export const TICKET_STATE_ORDER: readonly TicketState[] = [
  "new",
  "ready_for_implementation",
  "in_progress",
  "ready_for_acceptance",
  "done",
] as const;

/** Human labels for each state (plan glossary "UI state labels"). */
export const STATE_LABELS: Record<TicketState, string> = {
  new: "New",
  ready_for_implementation: "Ready for Implementation",
  in_progress: "In Progress",
  ready_for_acceptance: "Ready for Acceptance",
  done: "Done",
};

/** A team option for the team Select, from `GET /api/teams` (plan §4.4). */
export interface TeamOption {
  id: string;
  name: string;
}

/** An epic option for the epic Select, from `GET /api/epics?teamId` (§4.5). */
export interface EpicOption {
  id: string;
  title: string;
}

/** Full ticket detail (plan §4.6 GET): ticket + author email + epic title. */
export interface TicketDetail {
  id: string;
  teamId: string;
  epicId: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  createdBy: string;
  createdAt: string;
  modifiedAt: string;
  authorEmail: string;
  epicTitle: string | null;
}

/** The full ticket object returned by `POST /api/tickets` (plan §4.6). */
export interface CreatedTicket {
  id: string;
  teamId: string;
  epicId: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  createdBy: string;
  createdAt: string;
  modifiedAt: string;
}

/** A comment (plan §4.7): `{ id, author: { id, email }, body, createdAt }`. */
export interface Comment {
  id: string;
  author: { id: string; email: string };
  body: string;
  createdAt: string;
}

/** Query key for the teams list (team Select). */
export const teamsQueryKey = ["teams"] as const;

/** Query key factory for the epics list of a team (epic Select). */
export function ticketEpicsQueryKey(teamId: string) {
  return ["ticket-epics", teamId] as const;
}

/** Query key factory for a single ticket detail. */
export function ticketQueryKey(id: string) {
  return ["ticket", id] as const;
}

/** Query key factory for a ticket's comments. */
export function commentsQueryKey(ticketId: string) {
  return ["ticket-comments", ticketId] as const;
}

/** Load all teams for the team Select (sorted by name server-side, §4.4). */
export function useTeamOptions(): UseQueryResult<TeamOption[]> {
  return useQuery({
    queryKey: teamsQueryKey,
    queryFn: () => api.get<TeamOption[]>("/api/teams"),
  });
}

/**
 * Load epics for the epic Select via `GET /api/epics?teamId=`. Disabled until a
 * team is selected; keyed by `teamId` so switching teams loads new options.
 */
export function useEpicOptions(
  teamId: string | null,
): UseQueryResult<EpicOption[]> {
  return useQuery({
    queryKey: ticketEpicsQueryKey(teamId ?? ""),
    queryFn: () =>
      api.get<EpicOption[]>(
        `/api/epics?teamId=${encodeURIComponent(teamId ?? "")}`,
      ),
    enabled: teamId !== null && teamId.length > 0,
  });
}

/** Load a single ticket via `GET /api/tickets/{id}` (§4.6). Keyed by id. */
export function useTicket(id: string): UseQueryResult<TicketDetail> {
  return useQuery({
    queryKey: ticketQueryKey(id),
    queryFn: () => api.get<TicketDetail>(`/api/tickets/${id}`),
  });
}

/** Load a ticket's comments via `GET .../comments` (oldest-first, §4.7). */
export function useComments(ticketId: string): UseQueryResult<Comment[]> {
  return useQuery({
    queryKey: commentsQueryKey(ticketId),
    queryFn: () => api.get<Comment[]>(`/api/tickets/${ticketId}/comments`),
  });
}

/** Body sent to `POST /api/tickets` (plan §4.6). `state`/`epicId` optional. */
export interface CreateTicketInput {
  teamId: string;
  type: TicketType;
  title: string;
  body: string;
  state: TicketState;
  epicId: string | null;
}

/** Create a ticket via `POST /api/tickets` (§4.6). */
export function useCreateTicket(): UseMutationResult<
  CreatedTicket,
  unknown,
  CreateTicketInput
> {
  return useMutation({
    mutationFn: (input: CreateTicketInput) =>
      api.post<CreatedTicket>("/api/tickets", input),
  });
}

/** Body sent to `PATCH /api/tickets/{id}` (plan §4.6). */
export interface UpdateTicketInput {
  teamId: string;
  type: TicketType;
  title: string;
  body: string;
  state: TicketState;
  epicId: string | null;
}

/**
 * Edit a ticket via `PATCH /api/tickets/{id}` (§4.6). We send the full editable
 * field set; the backend advances `modified_at` only if at least one field
 * actually changes value (no-op save keeps it — §4.6/§5.8). On success the
 * ticket query is invalidated so the meta line reflects any new `modified_at`.
 */
export function useUpdateTicket(): UseMutationResult<
  TicketDetail,
  unknown,
  { id: string } & UpdateTicketInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateTicketInput) =>
      api.patch<TicketDetail>(`/api/tickets/${id}`, input),
    onSuccess: (_ticket, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ticketQueryKey(variables.id),
      });
    },
  });
}

/** Delete a ticket via `DELETE /api/tickets/{id}` (§4.6; cascades comments). */
export function useDeleteTicket(): UseMutationResult<
  void,
  unknown,
  { id: string }
> {
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.delete<void>(`/api/tickets/${id}`),
  });
}

/**
 * Post a comment via `POST /api/tickets/{id}/comments` (§4.7). Invalidates ONLY
 * the comments query — never the ticket query — because posting a comment does
 * not change the ticket (server-guaranteed; keeps the board order stable, §5.9).
 */
export function usePostComment(): UseMutationResult<
  Comment,
  unknown,
  { ticketId: string; body: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: string; body: string }) =>
      api.post<Comment>(`/api/tickets/${ticketId}/comments`, { body }),
    onSuccess: (_comment, variables) => {
      void queryClient.invalidateQueries({
        queryKey: commentsQueryKey(variables.ticketId),
      });
    },
  });
}

/** Format an ISO-8601 timestamp as a compact, explicit UTC string (§5.8). */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  return `${y}-${mo}-${d} ${h}:${mi} UTC`;
}
