"use client";

/**
 * CreateEpicPanel (plan §5.11 wireframe-5) — inline "Create epic" panel.
 *
 * Title (required) + Description (optional) fields + Create button. The team is
 * NOT a field here — it is taken from the screen's team selector and passed in
 * as `teamId` (team is chosen at create and thereafter immutable, §5.11/§4.5).
 * On success it clears the fields, fires a success toast, and lets the list
 * refetch (the hook invalidates the query). Error handling maps the typed
 * {@link ApiError}:
 *   - 400 (validation) → inline field message from the error envelope.
 *   - 404 (team missing) → toast (the selected team disappeared).
 *
 * Client validation (non-empty title) is UX-only; the backend re-validates (§4).
 */
import { useState, type CSSProperties, type FormEvent } from "react";

import { Button } from "@/ui/Button";
import { TextField } from "@/ui/TextField";
import { Textarea } from "@/ui/Textarea";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { useCreateEpic } from "./use-epics";

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
  padding: "var(--space-4)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
};

const HEADING_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-lg)",
  fontWeight: 600,
};

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
};

export function CreateEpicPanel({
  teamId,
  onDone,
}: {
  teamId: string;
  onDone?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const createEpic = useCreateEpic();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setError("Title is required.");
      return;
    }

    const trimmedDescription = description.trim();
    try {
      await createEpic.mutateAsync({
        teamId,
        title: trimmedTitle,
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
      });
      setTitle("");
      setDescription("");
      toast.success("Epic created.");
      onDone?.();
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 400) {
          setError(err.fields?.title ?? err.message ?? "Enter a valid title.");
          return;
        }
        if (err.status === 404) {
          toast.error("That team no longer exists.");
          return;
        }
      }
      toast.error("Could not create the epic. Please try again.");
    }
  }

  return (
    <form style={PANEL_STYLE} onSubmit={handleSubmit} noValidate>
      <h2 style={HEADING_STYLE}>Create epic</h2>
      <TextField
        label="Title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (error) {
            setError(null);
          }
        }}
        error={error}
        disabled={createEpic.isPending}
        autoComplete="off"
      />
      <Textarea
        label="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={createEpic.isPending}
      />
      <div style={ACTIONS_STYLE}>
        <Button type="submit" disabled={createEpic.isPending}>
          {createEpic.isPending ? "Creating…" : "Create"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onDone?.()}
          disabled={createEpic.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
