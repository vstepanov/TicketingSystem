"use client";

/**
 * Board data hooks (plan §5.7, §4.8, §4.6) — TanStack Query bindings over the
 * api-client for the Kanban board screen.
 *
 * The board data comes from `GET /api/board?teamId&type&epicId&q`. The query is
 * keyed by ALL filter params (teamId + type + epicId + q) so any filter change
 * refetches with the new params (§5.7 "filters drive the query"; §4.8 filters
 * combine AND, `q` is a case-insensitive title substring). While no team is
 * selected the query is disabled (§5.7 "no team selected → prompt selection").
 *
 * The dedicated state move is `PATCH /api/tickets/{id}/state` (§4.6). The board
 * screen performs an OPTIMISTIC move — it rewrites the cached board immediately
 * ({@link moveCardInBoard}) before the request resolves — and ROLLS BACK to the
 * captured snapshot on any non-2xx response (§5.7 "failed drop → card returns to
 * previous column + error toast"). Client validation is UX-only; the backend
 * re-validates everything (SHARED RULES/§4).
 */
import {
  useMutation,
  useQuery,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "@/lib/api-client";

/** Canonical ticket type enum (plan glossary / §3.4). */
export type TicketType = "bug" | "feature" | "fix";

/**
 * Canonical ticket state enum in board column order (plan glossary / §3.4):
 * new → ready_for_implementation → in_progress → ready_for_acceptance → done.
 */
export type TicketState =
  | "new"
  | "ready_for_implementation"
  | "in_progress"
  | "ready_for_acceptance"
  | "done";

/** Ordered canonical states — drives the five columns left-to-right (§5.7). */
export const BOARD_COLUMN_ORDER: readonly TicketState[] = [
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

/** A team option for the selector, from `GET /api/teams` (plan §4.4). */
export interface TeamOption {
  id: string;
  name: string;
}

/** An epic option for the epic filter, from `GET /api/epics?teamId` (§4.5). */
export interface EpicOption {
  id: string;
  title: string;
}

/** A single board card (plan §4.8; timestamps are ISO-8601 strings on the wire). */
export interface BoardCard {
  id: string;
  title: string;
  type: TicketType;
  epicTitle: string | null;
  modifiedAt: string;
}

/** One state column: post-filter count + ordered cards (modified_at DESC). */
export interface BoardColumn {
  count: number;
  tickets: BoardCard[];
}

/** The board response payload (plan §4.8): all five columns, counts, total. */
export interface BoardView {
  teamId: string;
  total: number;
  columns: Record<TicketState, BoardColumn>;
}

/** Active board filters (all optional except the implicit teamId). */
export interface BoardFilters {
  type: TicketType | "all";
  epicId: string | "all";
  q: string;
}

/** The default (cleared) filter set. */
export const EMPTY_FILTERS: BoardFilters = {
  type: "all",
  epicId: "all",
  q: "",
};

/** Query key for the teams list (selector). */
export const teamsQueryKey = ["teams"] as const;

/** Query key factory for the epics list of a team (epic filter). */
export function epicsQueryKey(teamId: string) {
  return ["board-epics", teamId] as const;
}

/**
 * Query key factory for the board — keyed by teamId + every filter so changing
 * any filter refetches with the new params (§5.7).
 */
export function boardQueryKey(teamId: string, filters: BoardFilters) {
  return ["board", teamId, filters.type, filters.epicId, filters.q] as const;
}

/** Build the `/api/board` query string from teamId + filters (AND semantics). */
export function boardQueryPath(teamId: string, filters: BoardFilters): string {
  const params = new URLSearchParams();
  params.set("teamId", teamId);
  if (filters.type !== "all") {
    params.set("type", filters.type);
  }
  if (filters.epicId !== "all") {
    params.set("epicId", filters.epicId);
  }
  const q = filters.q.trim();
  if (q.length > 0) {
    params.set("q", q);
  }
  return `/api/board?${params.toString()}`;
}

/** Load all teams for the selector (sorted by name server-side, §4.4). */
export function useTeamOptions(): UseQueryResult<TeamOption[]> {
  return useQuery({
    queryKey: teamsQueryKey,
    queryFn: () => api.get<TeamOption[]>("/api/teams"),
  });
}

/** Load epics for the epic filter via `GET /api/epics?teamId` (§4.5). */
export function useEpicOptions(
  teamId: string | null,
): UseQueryResult<EpicOption[]> {
  return useQuery({
    queryKey: epicsQueryKey(teamId ?? ""),
    queryFn: () =>
      api.get<EpicOption[]>(
        `/api/epics?teamId=${encodeURIComponent(teamId ?? "")}`,
      ),
    enabled: teamId !== null && teamId.length > 0,
  });
}

/**
 * Load the board via `GET /api/board?teamId&type&epicId&q` (§4.8). Disabled (no
 * fetch) until a team is selected; keyed by all filters so any change refetches.
 */
export function useBoard(
  teamId: string | null,
  filters: BoardFilters,
): UseQueryResult<BoardView> {
  return useQuery({
    queryKey: boardQueryKey(teamId ?? "", filters),
    queryFn: () => api.get<BoardView>(boardQueryPath(teamId ?? "", filters)),
    enabled: teamId !== null && teamId.length > 0,
  });
}

/** Variables for a state move. */
export interface StateMoveVars {
  id: string;
  state: TicketState;
}

/** The `PATCH /api/tickets/{id}/state` response (§4.6). */
export interface StateMoveResult {
  id: string;
  state: TicketState;
  modifiedAt: string;
}

/**
 * Move a card's state via `PATCH /api/tickets/{id}/state` (§4.6). The board
 * screen owns the optimistic cache write + rollback (it needs the drag context),
 * so this mutation is intentionally thin — no onMutate here.
 */
export function useMoveTicketState(): UseMutationResult<
  StateMoveResult,
  unknown,
  StateMoveVars
> {
  return useMutation({
    mutationFn: ({ id, state }: StateMoveVars) =>
      api.patch<StateMoveResult>(`/api/tickets/${id}/state`, { state }),
  });
}

/**
 * Pure helper — return a NEW {@link BoardView} with the card `cardId` moved from
 * its current column to `toState`. Used for the optimistic update.
 *
 * Behaviour:
 *   - Finds the card in any source column; if absent or already in `toState`,
 *     returns the board unchanged.
 *   - Removes it from the source column and PREPENDS it to the target column
 *     (a state change advances `modified_at`, and within a column the order is
 *     modified_at DESC — so the moved card sorts to the top, §4.6/§ glossary).
 *   - Recomputes per-column counts; `total` is unchanged (no add/remove).
 *
 * Returns `{ board, fromState }` so the caller can roll back precisely (it knows
 * which column to restore to) without re-deriving it.
 */
export function moveCardInBoard(
  board: BoardView,
  cardId: string,
  toState: TicketState,
): { board: BoardView; fromState: TicketState | null } {
  let fromState: TicketState | null = null;
  let moved: BoardCard | null = null;

  for (const state of BOARD_COLUMN_ORDER) {
    const found = board.columns[state].tickets.find((t) => t.id === cardId);
    if (found) {
      fromState = state;
      moved = found;
      break;
    }
  }

  if (moved === null || fromState === null || fromState === toState) {
    return { board, fromState };
  }

  const nextColumns = {} as Record<TicketState, BoardColumn>;
  for (const state of BOARD_COLUMN_ORDER) {
    let tickets = board.columns[state].tickets;
    if (state === fromState) {
      tickets = tickets.filter((t) => t.id !== cardId);
    }
    if (state === toState) {
      tickets = [moved, ...tickets.filter((t) => t.id !== cardId)];
    }
    nextColumns[state] = { count: tickets.length, tickets };
  }

  return {
    board: { ...board, columns: nextColumns },
    fromState,
  };
}

/** A single state-move request (the mutation's `mutateAsync`). */
export type StateMoveRequest = (vars: StateMoveVars) => Promise<unknown>;

/**
 * Perform an optimistic board move against the query cache, with rollback.
 *
 * Extracted from the screen so the optimistic-write + PATCH + rollback flow is
 * directly unit-testable (jsdom cannot easily simulate a real dnd-kit pointer/
 * keyboard drag). Given a resolved teamId + filters (→ the exact query key), the
 * dragged card id, and the destination state, it:
 *
 *   1. reads the cached {@link BoardView}; bails if absent or the move is a no-op;
 *   2. writes the optimistic board immediately (card in the target column);
 *   3. calls `mutate` (`PATCH /api/tickets/{id}/state`);
 *   4. on success invalidates the query so ordering/modified_at reconcile;
 *   5. on ANY failure restores the pre-move snapshot (card returns to its column)
 *      and invokes `onError` so the caller can show the error toast (§5.7).
 *
 * Returns `true` when a real move was attempted, `false` on a no-op/guard bail.
 */
export async function performOptimisticMove(params: {
  queryClient: QueryClient;
  teamId: string;
  filters: BoardFilters;
  cardId: string;
  toState: TicketState;
  mutate: StateMoveRequest;
  onError: () => void;
}): Promise<boolean> {
  const { queryClient, teamId, filters, cardId, toState, mutate, onError } =
    params;

  const key = boardQueryKey(teamId, filters);
  const previous = queryClient.getQueryData<BoardView>(key);
  if (!previous) {
    return false;
  }

  const { board: optimistic, fromState } = moveCardInBoard(
    previous,
    cardId,
    toState,
  );
  if (fromState === null || fromState === toState) {
    return false;
  }

  queryClient.setQueryData<BoardView>(key, optimistic);

  try {
    await mutate({ id: cardId, state: toState });
    void queryClient.invalidateQueries({ queryKey: key });
  } catch {
    queryClient.setQueryData<BoardView>(key, previous);
    onError();
  }
  return true;
}
