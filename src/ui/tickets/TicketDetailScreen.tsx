"use client";

/**
 * TicketDetailScreen (plan §5.8 wireframe-3) — the `/tickets/{id}` edit/detail
 * screen with the embedded comments panel (§5.9).
 *
 * Composition:
 *   - "← Back to board" link + a meta line: `TCK-{id} • Created by {author} •
 *     Created {ts} UTC • Modified {ts} UTC` (+ epic title when set), all UTC (§5.8).
 *   - The ticket title as a heading + top-right Delete (secondary) & Save (primary).
 *   - Two columns: left = the shared {@link TicketForm} prefilled from the loaded
 *     ticket; right = the {@link CommentsPanel}.
 *
 * Behaviour:
 *   - Load via `GET /api/tickets/{id}`; 404 → friendly "Ticket not found" (§5.8).
 *   - Save → `PATCH /api/tickets/{id}` with the full editable field set. The
 *     backend advances `modified_at` only on a real change (no-op save keeps it,
 *     §4.6/§5.8), so we do not need to diff client-side — we simply send the
 *     current values; a no-op save leaves the meta line unchanged. On success:
 *     toast + the ticket query is invalidated so the meta line refreshes.
 *   - Team change clears the epic (inside {@link TicketForm}) and re-queries epics.
 *   - Delete → ConfirmDialog → `DELETE /api/tickets/{id}` → toast + navigate to
 *     `/board` (cascades comments server-side, §4.6).
 *
 * Client validation is UX-only; the backend re-validates (SHARED RULES/§4).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/ui/Button";
import { Spinner } from "@/ui/Spinner";
import { EmptyState } from "@/ui/EmptyState";
import { ConfirmDialog } from "@/ui/Dialog";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { TicketForm, type TicketFormErrors, type TicketFormValues } from "./TicketForm";
import { CommentsPanel } from "./CommentsPanel";
import {
  formatUtc,
  useDeleteTicket,
  useEpicOptions,
  useTeamOptions,
  useTicket,
  useUpdateTicket,
  type TicketDetail,
} from "./use-ticket";

const BACK_STYLE: CSSProperties = {
  display: "inline-block",
  marginBottom: "var(--space-3)",
  color: "var(--color-text-muted)",
  fontSize: "var(--text-sm)",
  textDecoration: "none",
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-4)",
  marginBottom: "var(--space-4)",
  flexWrap: "wrap",
};

const TITLE_STYLE: CSSProperties = {
  margin: "0 0 var(--space-1)",
  fontSize: "var(--text-xl)",
  fontWeight: 600,
};

const META_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--color-text-muted)",
  fontSize: "var(--text-sm)",
};

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
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

function toFormValues(ticket: TicketDetail): TicketFormValues {
  return {
    teamId: ticket.teamId,
    type: ticket.type,
    state: ticket.state,
    epicId: ticket.epicId,
    title: ticket.title,
    body: ticket.body,
  };
}

export function TicketDetailScreen({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const toast = useToast();

  const ticketQuery = useTicket(ticketId);
  const teamsQuery = useTeamOptions();
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();

  const [values, setValues] = useState<TicketFormValues | null>(null);
  const [errors, setErrors] = useState<TicketFormErrors>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ticket = ticketQuery.data ?? null;

  // Prefill the form once the ticket loads (and re-sync if the ticket changes,
  // e.g. after a save invalidates the query). Keyed on the loaded field values.
  useEffect(() => {
    if (ticket) {
      setValues(toFormValues(ticket));
    }
  }, [ticket]);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const epicsQuery = useEpicOptions(values?.teamId ?? null);
  const epics = epicsQuery.data ?? [];

  function validate(current: TicketFormValues): boolean {
    const next: TicketFormErrors = {};
    if (current.teamId.length === 0) {
      next.teamId = "Team is required.";
    }
    if (current.title.trim().length === 0) {
      next.title = "Title is required.";
    }
    if (current.body.trim().length === 0) {
      next.body = "Body is required.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!values) {
      return;
    }
    if (!validate(values)) {
      return;
    }
    try {
      await updateTicket.mutateAsync({
        id: ticketId,
        teamId: values.teamId,
        type: values.type,
        state: values.state,
        epicId: values.epicId,
        title: values.title.trim(),
        body: values.body.trim(),
      });
      toast.success("Ticket saved.");
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 400) {
          if (err.fields) {
            setErrors({
              teamId: err.fields.teamId ?? null,
              type: err.fields.type ?? null,
              state: err.fields.state ?? null,
              epicId: err.fields.epicId ?? null,
              title: err.fields.title ?? null,
              body: err.fields.body ?? null,
            });
          } else {
            toast.error(err.message || "Please fix the errors and try again.");
          }
          return;
        }
        if (err.status === 404) {
          toast.error("That ticket no longer exists.");
          return;
        }
      }
      toast.error("Could not save the ticket. Please try again.");
    }
  }

  async function confirmDelete() {
    try {
      await deleteTicket.mutateAsync({ id: ticketId });
      toast.success("Ticket deleted.");
      setConfirmingDelete(false);
      router.push("/board");
    } catch (err) {
      setConfirmingDelete(false);
      if (isApiError(err) && err.status === 404) {
        toast.error("That ticket no longer exists.");
        return;
      }
      toast.error("Could not delete the ticket. Please try again.");
    }
  }

  if (ticketQuery.isLoading) {
    return (
      <div style={LOADING_STYLE} role="status" aria-live="polite">
        <Spinner /> Loading ticket…
      </div>
    );
  }

  if (ticketQuery.isError) {
    if (isApiError(ticketQuery.error) && ticketQuery.error.status === 404) {
      return (
        <section>
          <Link href="/board" style={BACK_STYLE}>
            ← Back to board
          </Link>
          <EmptyState
            message="Ticket not found."
            action={
              <Button onClick={() => router.push("/board")}>Back to board</Button>
            }
          />
        </section>
      );
    }
    return (
      <div style={ERROR_STYLE} role="alert">
        <p style={{ margin: "0 0 var(--space-3)" }}>
          Could not load the ticket. Please try again.
        </p>
        <Button variant="secondary" onClick={() => void ticketQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!ticket || !values) {
    return null;
  }

  const shortId = ticket.id.slice(0, 8);
  const metaParts = [
    `TCK-${shortId}`,
    `Created by ${ticket.authorEmail}`,
    `Created ${formatUtc(ticket.createdAt)}`,
    `Modified ${formatUtc(ticket.modifiedAt)}`,
  ];
  if (ticket.epicTitle) {
    metaParts.push(`Epic: ${ticket.epicTitle}`);
  }

  const busy = updateTicket.isPending || deleteTicket.isPending;

  return (
    <section>
      <Link href="/board" style={BACK_STYLE}>
        ← Back to board
      </Link>

      <div style={HEADER_STYLE}>
        <div>
          <h1 style={TITLE_STYLE}>{ticket.title}</h1>
          <p style={META_STYLE}>{metaParts.join(" • ")}</p>
        </div>
        <div style={ACTIONS_STYLE}>
          <Button
            variant="secondary"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
          >
            Delete
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {updateTicket.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div style={BODY_STYLE}>
        <TicketForm
          values={values}
          onChange={(next) => {
            setValues(next);
            setErrors({});
          }}
          errors={errors}
          teams={teams}
          epics={epics}
          epicsLoading={epicsQuery.isLoading}
          disabled={busy}
        />
        <CommentsPanel ticketId={ticketId} />
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete ticket"
        message={`Delete ticket "${ticket.title}"? This also deletes its comments and cannot be undone.`}
        confirmLabel="Delete"
        busy={deleteTicket.isPending}
        onConfirm={confirmDelete}
        onClose={() => setConfirmingDelete(false)}
      />
    </section>
  );
}
