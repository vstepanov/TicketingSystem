"use client";

/**
 * EpicsScreen (plan §5.11 wireframe-5) — the Epics management screen body.
 *
 * Composition:
 *   - Title "Epics" + a team {@link Select} (populated from `GET /api/teams`) +
 *     a "+ Create epic" toggle button. The epics list is scoped to the selected
 *     team; changing the team refetches `GET /api/epics?teamId=` (the query is
 *     keyed by teamId in {@link useEpics}). The selection is held in React state
 *     mirrored to the `teamId` URL query param — never localStorage (§2.1).
 *   - A collapsible {@link CreateEpicPanel} (team taken from the selector).
 *   - The epics {@link Table}: Title (+ description), Tickets, Modified, Actions,
 *     with a helper line "Delete is disabled while tickets reference the epic."
 *   - A right-side {@link EditEpicPanel} (team IMMUTABLE — no team field).
 *   - A {@link ConfirmDialog} for delete.
 *
 * States (§5.3): loading (spinner), error (inline + Retry), empty ("No epics for
 * this team yet." / "Select a team" / "create a team first"), success (toast on
 * mutations). Delete 409 (`EPIC_REFERENCED`) — which can only happen on a race
 * since the button is disabled when `canDelete` is false — surfaces a clear
 * toast.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/ui/Button";
import { Select } from "@/ui/Select";
import { Spinner } from "@/ui/Spinner";
import { EmptyState } from "@/ui/EmptyState";
import { ConfirmDialog } from "@/ui/Dialog";
import { Table, TBody, THead, Th, Tr } from "@/ui/Table";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { CreateEpicPanel } from "./CreateEpicPanel";
import { EditEpicPanel } from "./EditEpicPanel";
import { EpicRow } from "./EpicRow";
import {
  useDeleteEpic,
  useEpics,
  useTeamOptions,
  type Epic,
} from "./use-epics";

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "var(--space-4)",
  marginBottom: "var(--space-4)",
  flexWrap: "wrap",
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-xl)",
  fontWeight: 600,
};

const CONTROLS_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "var(--space-3)",
};

const HELPER_STYLE: CSSProperties = {
  margin: "var(--space-3) 0 0",
  color: "var(--color-text-muted)",
  fontSize: "var(--text-sm)",
};

const LOADING_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "var(--space-6)",
  color: "var(--color-text-muted)",
};

const ERROR_STYLE: CSSProperties = {
  padding: "var(--space-4)",
  color: "var(--color-danger)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  background: "var(--color-surface)",
};

const BODY_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)",
  gap: "var(--space-4)",
  alignItems: "start",
};

const DELETE_REFERENCED_MESSAGE =
  "Epic is referenced by tickets and can't be deleted.";

export function EpicsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTeamId = searchParams.get("teamId");

  const teamsQuery = useTeamOptions();
  const toast = useToast();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    urlTeamId,
  );
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Epic | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Epic | null>(null);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);

  // Once teams load, resolve the effective selection: honour a valid URL/state
  // teamId, otherwise default to the first team. Kept in React state and
  // mirrored to the URL (never localStorage).
  useEffect(() => {
    if (teams.length === 0) {
      return;
    }
    const stillValid =
      selectedTeamId !== null && teams.some((t) => t.id === selectedTeamId);
    if (!stillValid) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  function selectTeam(teamId: string) {
    setSelectedTeamId(teamId);
    setShowCreate(false);
    setEditing(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("teamId", teamId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const epicsQuery = useEpics(selectedTeamId);
  const deleteEpic = useDeleteEpic();

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    try {
      await deleteEpic.mutateAsync({
        id: pendingDelete.id,
        teamId: pendingDelete.teamId,
      });
      toast.success("Epic deleted.");
      setPendingDelete(null);
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        toast.error(DELETE_REFERENCED_MESSAGE);
      } else if (isApiError(err) && err.status === 404) {
        toast.error("That epic no longer exists.");
      } else {
        toast.error("Could not delete the epic. Please try again.");
      }
      setPendingDelete(null);
    }
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const epics = epicsQuery.data ?? [];

  return (
    <section>
      <div style={HEADER_STYLE}>
        <h1 style={TITLE_STYLE}>Epics</h1>
        <div style={CONTROLS_STYLE}>
          {teams.length > 0 && (
            <div style={{ minWidth: "220px" }}>
              <Select
                label="Team"
                value={selectedTeamId ?? ""}
                onChange={(e) => selectTeam(e.target.value)}
                disabled={teamsQuery.isLoading}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button
            onClick={() => setShowCreate((v) => !v)}
            disabled={!selectedTeamId}
          >
            + Create epic
          </Button>
        </div>
      </div>

      {teamsQuery.isLoading ? (
        <div style={LOADING_STYLE} role="status" aria-live="polite">
          <Spinner /> Loading teams…
        </div>
      ) : teamsQuery.isError ? (
        <div style={ERROR_STYLE} role="alert">
          <p style={{ margin: "0 0 var(--space-3)" }}>
            Could not load teams. Please try again.
          </p>
          <Button variant="secondary" onClick={() => void teamsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : teams.length === 0 ? (
        <EmptyState message="No teams yet — create a team before adding epics." />
      ) : !selectedTeamId ? (
        <EmptyState message="Select a team to view its epics." />
      ) : (
        <div style={BODY_STYLE}>
          <div>
            {showCreate && (
              <div style={{ marginBottom: "var(--space-4)" }}>
                <CreateEpicPanel
                  teamId={selectedTeamId}
                  onDone={() => setShowCreate(false)}
                />
              </div>
            )}

            {epicsQuery.isLoading ? (
              <div style={LOADING_STYLE} role="status" aria-live="polite">
                <Spinner /> Loading epics…
              </div>
            ) : epicsQuery.isError ? (
              <div style={ERROR_STYLE} role="alert">
                <p style={{ margin: "0 0 var(--space-3)" }}>
                  Could not load epics. Please try again.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void epicsQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : epics.length === 0 ? (
              <EmptyState
                message="No epics for this team yet."
                action={
                  <Button onClick={() => setShowCreate(true)}>
                    + Create epic
                  </Button>
                }
              />
            ) : (
              <>
                <Table>
                  <THead>
                    <Tr>
                      <Th>Title</Th>
                      <Th>Tickets</Th>
                      <Th>Modified</Th>
                      <Th style={{ textAlign: "right" }}>Actions</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {epics.map((epic) => (
                      <EpicRow
                        key={epic.id}
                        epic={epic}
                        onRequestEdit={setEditing}
                        onRequestDelete={setPendingDelete}
                      />
                    ))}
                  </TBody>
                </Table>
                <p style={HELPER_STYLE}>
                  Delete is disabled while tickets reference the epic.
                </p>
              </>
            )}
          </div>

          {editing && (
            <EditEpicPanel
              epic={editing}
              teamName={selectedTeam?.name}
              onClose={() => setEditing(null)}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete epic"
        message={
          pendingDelete
            ? `Delete epic "${pendingDelete.title}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        busy={deleteEpic.isPending}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </section>
  );
}
