"use client";

/**
 * TeamRow (plan §5.10 wireframe-4) — one row of the Teams table.
 *
 * Displays name, ticket & epic counts (as {@link Pill}s), the Modified timestamp
 * (UTC), and the Edit / Delete actions:
 *   - Edit toggles an in-place rename form (PATCH). 409 → "A team with that name
 *     already exists."; 404 → the team no longer exists (toast + refetch).
 *   - Delete is DISABLED when `canDelete === false` (the team has tickets or
 *     epics), with an explanatory tooltip/`aria-disabled` (§5.10). When enabled
 *     the parent opens a ConfirmDialog before deleting.
 */
import { useState, type CSSProperties, type FormEvent } from "react";

import { Button } from "@/ui/Button";
import { TextField } from "@/ui/TextField";
import { Pill } from "@/ui/Pill";
import { Td, Tr } from "@/ui/Table";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { useRenameTeam, type Team } from "./use-teams";

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
};

const RENAME_FORM_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--space-2)",
};

const DELETE_DISABLED_HINT =
  "Delete is disabled while a team contains tickets or epics.";
const DUPLICATE_MESSAGE = "A team with that name already exists.";

/** Serialize an ISO timestamp to a compact UTC display (plan §5.10, all UTC). */
function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function TeamRow({
  team,
  onRequestDelete,
}: {
  team: Team;
  onRequestDelete: (team: Team) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const renameTeam = useRenameTeam();

  function startEditing() {
    setName(team.name);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError(null);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Team name is required.");
      return;
    }

    try {
      await renameTeam.mutateAsync({ id: team.id, name: trimmed });
      toast.success("Team renamed.");
      setEditing(false);
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 409) {
          setError(DUPLICATE_MESSAGE);
          return;
        }
        if (err.status === 400) {
          setError(err.fields?.name ?? err.message ?? "Enter a valid team name.");
          return;
        }
        if (err.status === 404) {
          toast.error("That team no longer exists.");
          setEditing(false);
          return;
        }
      }
      toast.error("Could not rename the team. Please try again.");
    }
  }

  return (
    <Tr>
      <Td>
        {editing ? (
          <form style={RENAME_FORM_STYLE} onSubmit={handleRename} noValidate>
            <div style={{ minWidth: "200px" }}>
              <TextField
                label="Team name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                error={error}
                disabled={renameTeam.isPending}
                autoFocus
                autoComplete="off"
              />
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", paddingTop: "26px" }}>
              <Button type="submit" disabled={renameTeam.isPending}>
                {renameTeam.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEditing}
                disabled={renameTeam.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <span style={{ fontWeight: 500 }}>{team.name}</span>
        )}
      </Td>
      <Td>
        <Pill>{team.ticketCount}</Pill>
      </Td>
      <Td>
        <Pill>{team.epicCount}</Pill>
      </Td>
      <Td style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
        {formatUtc(team.modifiedAt)}
      </Td>
      <Td>
        {!editing && (
          <div style={ACTIONS_STYLE}>
            <Button variant="secondary" onClick={startEditing}>
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={() => onRequestDelete(team)}
              disabled={!team.canDelete}
              title={team.canDelete ? undefined : DELETE_DISABLED_HINT}
            >
              Delete
            </Button>
          </div>
        )}
      </Td>
    </Tr>
  );
}
