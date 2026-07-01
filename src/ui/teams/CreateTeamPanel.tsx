"use client";

/**
 * CreateTeamPanel (plan §5.10 wireframe-4) — the "Create team" form body.
 *
 * Rendered inside the Teams screen's {@link Dialog} popup (the dialog supplies
 * the card chrome + "Create team" heading + focus trap), so this component is
 * intentionally chromeless: just the Team-name field + Create button.
 *
 * A single Team-name field + Create button. On submit it calls the create
 * mutation; on success it clears the field, fires a success toast, and lets the
 * list refetch (the hook invalidates the query). Error handling maps the typed
 * {@link ApiError}:
 *   - 409 (duplicate name) → inline "A team with that name already exists."
 *   - 400 (validation) → inline field message from the error envelope.
 *
 * Client validation (non-empty) is UX-only; the backend re-validates (§4).
 */
import { useState, type CSSProperties, type FormEvent } from "react";

import { Button } from "@/ui/Button";
import { TextField } from "@/ui/TextField";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { useCreateTeam } from "./use-teams";

const FORM_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--space-3)",
};

const DUPLICATE_MESSAGE = "A team with that name already exists.";

export function CreateTeamPanel({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const createTeam = useCreateTeam();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Team name is required.");
      return;
    }

    try {
      await createTeam.mutateAsync({ name: trimmed });
      setName("");
      toast.success("Team created.");
      onDone?.();
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
      }
      toast.error("Could not create the team. Please try again.");
    }
  }

  return (
    <form style={FORM_STYLE} onSubmit={handleSubmit} noValidate>
      <div style={ROW_STYLE}>
        <div style={{ flex: 1 }}>
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
            disabled={createTeam.isPending}
            placeholder="e.g. Platform Engineering"
            autoComplete="off"
          />
        </div>
        <div style={{ paddingTop: "26px" }}>
          <Button type="submit" disabled={createTeam.isPending}>
            {createTeam.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </form>
  );
}
