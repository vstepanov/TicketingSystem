"use client";

/**
 * Select (plan §5.2) — labelled `<select>` dropdown with inline error support.
 *
 * Mirrors {@link TextField}: the `<label>` is tied to the control via
 * `htmlFor`/`id`; when an `error` is present the control gets `aria-invalid` and
 * `aria-describedby` pointing at the {@link FieldError}. Options are passed as
 * children so callers keep full control (e.g. a placeholder `<option>` plus a
 * mapped list). Styling is inline off the monochrome design tokens (§5.1),
 * consistent with the other form primitives (the scaffold has no CSS pipeline).
 *
 * Used by the Epics screen team selector (S17) and reused by the Board (S18) and
 * Ticket detail (S19) screens.
 */
import { useId, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from "react";

import { FieldError } from "./FieldError";

const FIELD_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
};

const LABEL_STYLE: CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  color: "var(--color-text)",
};

const SELECT_STYLE: CSSProperties = {
  height: "36px",
  padding: "0 var(--space-3)",
  fontSize: "var(--text-base)",
  fontFamily: "inherit",
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-md)",
  width: "100%",
};

const SELECT_ERROR_STYLE: CSSProperties = {
  borderColor: "var(--color-danger)",
};

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  /** Visible field label, tied to the control via `htmlFor`. */
  label: string;
  /** Inline validation message; when set the control is marked invalid. */
  error?: string | null;
  /** `<option>` elements. */
  children: ReactNode;
}

export function Select({
  label,
  error,
  style,
  required,
  children,
  ...rest
}: SelectProps) {
  const selectId = useId();
  const errorId = `${selectId}-error`;

  return (
    <div style={FIELD_STYLE}>
      <label htmlFor={selectId} style={LABEL_STYLE}>
        {label}
      </label>
      <select
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          ...SELECT_STYLE,
          ...(error ? SELECT_ERROR_STYLE : {}),
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
