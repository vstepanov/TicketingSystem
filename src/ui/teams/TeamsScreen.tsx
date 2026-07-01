"use client";

/**
 * TeamsScreen (plan §5.10 wireframe-4) — the Teams management screen body.
 *
 * Composition:
 *   - Title "Teams" + caption "All verified users can view and manage all
 *     teams." + a "+ Create team" toggle button.
 *   - A collapsible {@link CreateTeamPanel} (inline create form).
 *   - The teams {@link Table}: Name, Tickets, Epics, Modified, Actions, with a
 *     helper line "Delete is disabled while a team contains tickets or epics."
 *   - A {@link ConfirmDialog} for delete.
 *
 * States (§5.3): loading (spinner), error (inline + toast on load error), empty
 * ("No teams yet — create your first team."), success (toast on mutations).
 * Delete 409 (`TEAM_NOT_EMPTY`) — which can only happen on a race since the
 * button is disabled when `canDelete` is false — surfaces a clear toast.
 */
import { useState, type CSSProperties } from "react";

import { Button } from "@/ui/Button";
import { Spinner } from "@/ui/Spinner";
import { EmptyState } from "@/ui/EmptyState";
import { ConfirmDialog } from "@/ui/Dialog";
import { Table, TBody, THead, Th, Tr } from "@/ui/Table";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { CreateTeamPanel } from "./CreateTeamPanel";
import { TeamRow } from "./TeamRow";
import { useDeleteTeam, useTeams, type Team } from "./use-teams";

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-4)",
  marginBottom: "var(--space-4)",
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-xl)",
  fontWeight: 600,
};

const CAPTION_STYLE: CSSProperties = {
  margin: "var(--space-1) 0 0",
  color: "var(--color-text-muted)",
  fontSize: "var(--text-sm)",
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

const DELETE_NOT_EMPTY_MESSAGE =
  "Team has tickets or epics and can't be deleted.";

export function TeamsScreen() {
  const teamsQuery = useTeams();
  const deleteTeam = useDeleteTeam();
  const toast = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Team | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    try {
      await deleteTeam.mutateAsync({ id: pendingDelete.id });
      toast.success("Team deleted.");
      setPendingDelete(null);
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        toast.error(DELETE_NOT_EMPTY_MESSAGE);
      } else if (isApiError(err) && err.status === 404) {
        toast.error("That team no longer exists.");
      } else {
        toast.error("Could not delete the team. Please try again.");
      }
      setPendingDelete(null);
    }
  }

  const teams = teamsQuery.data ?? [];

  return (
    <section>
      <div style={HEADER_STYLE}>
        <div>
          <h1 style={TITLE_STYLE}>Teams</h1>
          <p style={CAPTION_STYLE}>
            All verified users can view and manage all teams.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>+ Create team</Button>
      </div>

      {showCreate && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <CreateTeamPanel onDone={() => setShowCreate(false)} />
        </div>
      )}

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
        <EmptyState
          message="No teams yet — create your first team."
          action={
            <Button onClick={() => setShowCreate(true)}>+ Create team</Button>
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Tickets</Th>
                <Th>Epics</Th>
                <Th>Modified</Th>
                <Th style={{ textAlign: "right" }}>Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {teams.map((team) => (
                <TeamRow
                  key={team.id}
                  team={team}
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </TBody>
          </Table>
          <p style={HELPER_STYLE}>
            Delete is disabled while a team contains tickets or epics.
          </p>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete team"
        message={
          pendingDelete
            ? `Delete team "${pendingDelete.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        busy={deleteTeam.isPending}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </section>
  );
}
