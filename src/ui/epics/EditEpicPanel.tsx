"use client";

/**
 * EditEpicPanel (plan §5.11 wireframe-5) — right-side "Edit epic" panel.
 *
 * Edits Title + Description only. The team is IMMUTABLE: this panel deliberately
 * renders NO team field/selector (the API rejects `teamId` on PATCH with 400,
 * §4.5). Instead the epic's team is shown as read-only context text. Cancel /
 * Save actions; on save it calls the update mutation (title + description only),
 * fires a success toast, and closes. Error handling maps the typed
 * {@link ApiError}:
 *   - 400 (validation) → inline field message from the error envelope.
 *   - 404 (epic gone) → toast + close.
 *
 * Client validation (non-empty title) is UX-only; the backend re-validates (§4).
 */
import { useState, type CSSProperties, type FormEvent } from "react";

import { Button } from "@/ui/Button";
import { TextField } from "@/ui/TextField";
import { Textarea } from "@/ui/Textarea";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { useUpdateEpic, type Epic } from "./use-epics";

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

const CONTEXT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
};

export function EditEpicPanel({
  epic,
  teamName,
  onClose,
}: {
  epic: Epic;
  teamName?: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(epic.title);
  const [description, setDescription] = useState(epic.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const updateEpic = useUpdateEpic();

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
      await updateEpic.mutateAsync({
        id: epic.id,
        teamId: epic.teamId,
        title: trimmedTitle,
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
      });
      toast.success("Epic updated.");
      onClose();
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 400) {
          setError(err.fields?.title ?? err.message ?? "Enter a valid title.");
          return;
        }
        if (err.status === 404) {
          toast.error("That epic no longer exists.");
          onClose();
          return;
        }
      }
      toast.error("Could not update the epic. Please try again.");
    }
  }

  return (
    <form style={PANEL_STYLE} onSubmit={handleSubmit} noValidate aria-label="Edit epic">
      <h2 style={HEADING_STYLE}>Edit epic</h2>
      {/* Team is immutable: shown as read-only context, never editable here. */}
      <p style={CONTEXT_STYLE}>Team: {teamName ?? "—"} (cannot be changed)</p>
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
        disabled={updateEpic.isPending}
        autoFocus
        autoComplete="off"
      />
      <Textarea
        label="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={updateEpic.isPending}
      />
      <div style={ACTIONS_STYLE}>
        <Button type="submit" disabled={updateEpic.isPending}>
          {updateEpic.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={updateEpic.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
