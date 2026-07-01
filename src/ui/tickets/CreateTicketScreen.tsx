"use client";

/**
 * CreateTicketScreen (plan §5.8 wireframe-3) — the `/tickets/new` create screen.
 *
 * Composition:
 *   - "← Back to board" link.
 *   - Heading "New ticket" + a "Create" primary button (top-right).
 *   - The shared {@link TicketForm} (team/type/state/epic/title/body). No comments
 *     panel — comments only exist for a saved ticket (§5.9).
 *
 * The team defaults to the `teamId` URL query param (the board links here with
 * the selected team, §5.7) if it is valid, else the first team. Epic options load
 * for the current team; changing the team clears the epic (handled inside
 * {@link TicketForm}) and re-queries epics for the new team.
 *
 * On submit → `POST /api/tickets`. On 201 → success toast + navigate to the new
 * ticket's detail page (`/tickets/{id}`, §5.8). A 400 maps field errors inline
 * (incl. a cross-team epic → epicId error, though the UI prevents it). Client
 * validation (non-empty title/body) is UX-only; the backend re-validates (§4).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/ui/Button";
import { Spinner } from "@/ui/Spinner";
import { EmptyState } from "@/ui/EmptyState";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { TicketForm, type TicketFormErrors, type TicketFormValues } from "./TicketForm";
import {
  useCreateTicket,
  useEpicOptions,
  useTeamOptions,
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
  alignItems: "center",
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
  maxWidth: "720px",
};

function emptyValues(teamId: string): TicketFormValues {
  return {
    teamId,
    type: "bug",
    state: "new",
    epicId: null,
    title: "",
    body: "",
  };
}

export function CreateTicketScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTeamId = searchParams.get("teamId");
  const toast = useToast();

  const teamsQuery = useTeamOptions();
  const createTicket = useCreateTicket();

  const [values, setValues] = useState<TicketFormValues>(() =>
    emptyValues(urlTeamId ?? ""),
  );
  const [errors, setErrors] = useState<TicketFormErrors>({});

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);

  // Once teams load, resolve the effective team: honour a valid URL teamId,
  // otherwise default to the first team. Only fills a currently-empty selection.
  useEffect(() => {
    if (teams.length === 0 || values.teamId.length > 0) {
      return;
    }
    setValues((current) => ({ ...current, teamId: teams[0].id }));
  }, [teams, values.teamId]);

  const epicsQuery = useEpicOptions(
    values.teamId.length > 0 ? values.teamId : null,
  );
  const epics = epicsQuery.data ?? [];

  function validate(): boolean {
    const next: TicketFormErrors = {};
    if (values.teamId.length === 0) {
      next.teamId = "Team is required.";
    }
    if (values.title.trim().length === 0) {
      next.title = "Title is required.";
    }
    if (values.body.trim().length === 0) {
      next.body = "Body is required.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) {
      return;
    }
    try {
      const ticket = await createTicket.mutateAsync({
        teamId: values.teamId,
        type: values.type,
        state: values.state,
        epicId: values.epicId,
        title: values.title.trim(),
        body: values.body.trim(),
      });
      toast.success("Ticket created.");
      router.push(`/tickets/${ticket.id}`);
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
          toast.error("The selected team or epic no longer exists.");
          return;
        }
      }
      toast.error("Could not create the ticket. Please try again.");
    }
  }

  return (
    <section>
      <Link href="/board" style={BACK_STYLE}>
        ← Back to board
      </Link>

      {teamsQuery.isLoading ? (
        <div style={LOADING_STYLE} role="status" aria-live="polite">
          <Spinner /> Loading…
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
        <EmptyState message="No teams yet — create a team before adding a ticket." />
      ) : (
        <div style={BODY_STYLE}>
          <div style={HEADER_STYLE}>
            <h1 style={TITLE_STYLE}>New ticket</h1>
            <Button onClick={handleSubmit} disabled={createTicket.isPending}>
              {createTicket.isPending ? "Creating…" : "Create"}
            </Button>
          </div>

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
            disabled={createTicket.isPending}
          />
        </div>
      )}
    </section>
  );
}
