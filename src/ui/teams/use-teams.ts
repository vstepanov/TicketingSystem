"use client";

/**
 * Teams data hooks (plan §5.10, §4.4) — TanStack Query bindings over the
 * api-client for the Teams screen.
 *
 * All server-state access goes through {@link api} (which sends the session
 * cookie and throws typed {@link ApiError}s). Mutations invalidate the teams
 * query on success so the table refetches (§5.3 "Success: toast + cache
 * invalidation/refetch"). Client validation here is UX-only; the backend
 * re-validates everything (SHARED RULES / §4).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "@/lib/api-client";

/** A team row from `GET /api/teams` (plan §4.4). */
export interface Team {
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  ticketCount: number;
  epicCount: number;
  canDelete: boolean;
}

/** Query key for the teams list (single source so mutations can invalidate it). */
export const teamsQueryKey = ["teams"] as const;

/** Load all teams (sorted by name server-side). */
export function useTeams(): UseQueryResult<Team[]> {
  return useQuery({
    queryKey: teamsQueryKey,
    queryFn: () => api.get<Team[]>("/api/teams"),
  });
}

/** Create a team via `POST /api/teams`; invalidates the list on success. */
export function useCreateTeam(): UseMutationResult<Team, unknown, { name: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.post<Team>("/api/teams", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamsQueryKey });
    },
  });
}

/** Rename a team via `PATCH /api/teams/{id}`; invalidates the list on success. */
export function useRenameTeam(): UseMutationResult<
  Team,
  unknown,
  { id: string; name: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Team>(`/api/teams/${id}`, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamsQueryKey });
    },
  });
}

/** Delete a team via `DELETE /api/teams/{id}`; invalidates the list on success. */
export function useDeleteTeam(): UseMutationResult<void, unknown, { id: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.delete<void>(`/api/teams/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamsQueryKey });
    },
  });
}
