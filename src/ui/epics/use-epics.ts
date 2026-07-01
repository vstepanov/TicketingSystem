"use client";

/**
 * Epics data hooks (plan §5.11, §4.5) — TanStack Query bindings over the
 * api-client for the Epics screen, plus the teams hook that populates the team
 * selector (§4.4).
 *
 * The epics list is scoped to the selected team: the query is keyed by `teamId`
 * so changing the selector refetches `GET /api/epics?teamId=` (and while no team
 * is selected the query is disabled). Mutations invalidate the epics query for
 * the relevant team on success so the table refetches (§5.3 "Success: toast +
 * cache invalidation/refetch"). Team is set at create and is IMMUTABLE — the
 * edit mutation never sends `teamId` (the backend rejects it with 400, §4.5).
 * Client validation here is UX-only; the backend re-validates (SHARED RULES/§4).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "@/lib/api-client";

/** A team option for the selector, from `GET /api/teams` (plan §4.4). */
export interface TeamOption {
  id: string;
  name: string;
}

/** An epic row from `GET /api/epics?teamId=` (plan §4.5). */
export interface Epic {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  createdAt: string;
  modifiedAt: string;
  ticketCount: number;
  canDelete: boolean;
}

/** Query key for the teams list (used only for the selector here). */
export const teamsQueryKey = ["teams"] as const;

/** Query key factory for the epics list, scoped per team. */
export function epicsQueryKey(teamId: string) {
  return ["epics", teamId] as const;
}

/** Load all teams for the selector (sorted by name server-side). */
export function useTeamOptions(): UseQueryResult<TeamOption[]> {
  return useQuery({
    queryKey: teamsQueryKey,
    queryFn: () => api.get<TeamOption[]>("/api/teams"),
  });
}

/**
 * Load epics for a team via `GET /api/epics?teamId=`. Disabled (no fetch) until
 * a team is selected; keyed by `teamId` so switching teams refetches.
 */
export function useEpics(teamId: string | null): UseQueryResult<Epic[]> {
  return useQuery({
    queryKey: epicsQueryKey(teamId ?? ""),
    queryFn: () =>
      api.get<Epic[]>(`/api/epics?teamId=${encodeURIComponent(teamId ?? "")}`),
    enabled: teamId !== null && teamId.length > 0,
  });
}

/** Create an epic via `POST /api/epics`; invalidates the team's epics on success. */
export function useCreateEpic(): UseMutationResult<
  Epic,
  unknown,
  { teamId: string; title: string; description?: string | null }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      teamId: string;
      title: string;
      description?: string | null;
    }) => api.post<Epic>("/api/epics", input),
    onSuccess: (epic) => {
      void queryClient.invalidateQueries({ queryKey: epicsQueryKey(epic.teamId) });
    },
  });
}

/**
 * Edit an epic via `PATCH /api/epics/{id}` — title/description only. Team is
 * IMMUTABLE and never sent (backend rejects `teamId` with 400). Invalidates the
 * team's epics list on success.
 */
export function useUpdateEpic(): UseMutationResult<
  Epic,
  unknown,
  { id: string; teamId: string; title: string; description: string | null }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      title,
      description,
    }: {
      id: string;
      teamId: string;
      title: string;
      description: string | null;
    }) => api.patch<Epic>(`/api/epics/${id}`, { title, description }),
    onSuccess: (_epic, variables) => {
      void queryClient.invalidateQueries({
        queryKey: epicsQueryKey(variables.teamId),
      });
    },
  });
}

/** Delete an epic via `DELETE /api/epics/{id}`; invalidates the team's epics. */
export function useDeleteEpic(): UseMutationResult<
  void,
  unknown,
  { id: string; teamId: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; teamId: string }) =>
      api.delete<void>(`/api/epics/${id}`),
    onSuccess: (_void, variables) => {
      void queryClient.invalidateQueries({
        queryKey: epicsQueryKey(variables.teamId),
      });
    },
  });
}
