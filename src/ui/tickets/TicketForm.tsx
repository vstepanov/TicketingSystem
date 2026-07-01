"use client";

/**
 * TicketForm (plan §5.8 wireframe-3) — the ticket create/edit form body.
 *
 * A controlled component: the parent screen owns the {@link TicketFormValues}
 * state and passes `values` + `onChange`; this component renders the fields and
 * per-field errors. It is used by BOTH the create screen (S19) and the detail/
 * edit screen so the field layout + team-change-clears-epic behaviour live in one
 * place.
 *
 * Fields (§5.8):
 *   - Team (Select, from `GET /api/teams`).
 *   - Type (Select bug/feature/fix).
 *   - State (Select — 5 canonical values with UI labels).
 *   - Epic (Select from `GET /api/epics?teamId`, plus a "None" option).
 *   - Title (TextField, required).
 *   - Body (Textarea, required).
 *
 * TEAM CHANGE CLEARS EPIC (§5.8/§4.6): when the team Select changes we call
 * `onChange` with the new `teamId` AND `epicId: null` in a single update, because
 * an epic must belong to the ticket's team (the backend rejects a cross-team
 * epic). The parent re-queries epics for the new team (the epic Select then shows
 * the new options); the previously selected epic is dropped.
 *
 * Client validation is UX-only; the backend re-validates (SHARED RULES/§4).
 */
import type { CSSProperties } from "react";

import { Select } from "@/ui/Select";
import { TextField } from "@/ui/TextField";
import { Textarea } from "@/ui/Textarea";
import {
  STATE_LABELS,
  TICKET_STATE_ORDER,
  TICKET_TYPE_ORDER,
  TYPE_LABELS,
  type EpicOption,
  type TeamOption,
  type TicketState,
  type TicketType,
} from "./use-ticket";

/** The editable ticket field set (state managed by the parent screen). */
export interface TicketFormValues {
  teamId: string;
  type: TicketType;
  state: TicketState;
  epicId: string | null;
  title: string;
  body: string;
}

/** Per-field inline error messages (from client checks or a 400 envelope). */
export interface TicketFormErrors {
  teamId?: string | null;
  type?: string | null;
  state?: string | null;
  epicId?: string | null;
  title?: string | null;
  body?: string | null;
}

const FORM_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
  padding: "var(--space-4)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
};

const ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "var(--space-3)",
};

/** The "no epic" sentinel value used by the epic Select `<option>`. */
const EPIC_NONE = "";

export interface TicketFormProps {
  values: TicketFormValues;
  onChange: (next: TicketFormValues) => void;
  errors?: TicketFormErrors;
  teams: TeamOption[];
  epics: EpicOption[];
  /** Whether the epic options are still loading (disables the epic Select). */
  epicsLoading?: boolean;
  /** Disables all fields (e.g. while a save/create is in flight). */
  disabled?: boolean;
}

export function TicketForm({
  values,
  onChange,
  errors = {},
  teams,
  epics,
  epicsLoading = false,
  disabled = false,
}: TicketFormProps) {
  function patch(partial: Partial<TicketFormValues>) {
    onChange({ ...values, ...partial });
  }

  return (
    <div style={FORM_STYLE}>
      <div style={ROW_STYLE}>
        <Select
          label="Team"
          value={values.teamId}
          error={errors.teamId}
          disabled={disabled}
          // TEAM CHANGE CLEARS EPIC: reset epic to none in the same update so a
          // stale cross-team epic can never be submitted (§5.8/§4.6).
          onChange={(e) => patch({ teamId: e.target.value, epicId: null })}
        >
          <option value="" disabled>
            Select a team
          </option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>

        <Select
          label="Epic (optional)"
          value={values.epicId ?? EPIC_NONE}
          error={errors.epicId}
          disabled={disabled || epicsLoading || values.teamId.length === 0}
          onChange={(e) =>
            patch({ epicId: e.target.value === EPIC_NONE ? null : e.target.value })
          }
        >
          <option value={EPIC_NONE}>None</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.title}
            </option>
          ))}
        </Select>
      </div>

      <div style={ROW_STYLE}>
        <Select
          label="Type"
          value={values.type}
          error={errors.type}
          disabled={disabled}
          onChange={(e) => patch({ type: e.target.value as TicketType })}
        >
          {TICKET_TYPE_ORDER.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </Select>

        <Select
          label="State"
          value={values.state}
          error={errors.state}
          disabled={disabled}
          onChange={(e) => patch({ state: e.target.value as TicketState })}
        >
          {TICKET_STATE_ORDER.map((state) => (
            <option key={state} value={state}>
              {STATE_LABELS[state]}
            </option>
          ))}
        </Select>
      </div>

      <TextField
        label="Title"
        value={values.title}
        error={errors.title}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => patch({ title: e.target.value })}
      />

      <Textarea
        label="Body"
        value={values.body}
        error={errors.body}
        disabled={disabled}
        style={{ minHeight: "160px" }}
        onChange={(e) => patch({ body: e.target.value })}
      />
    </div>
  );
}
