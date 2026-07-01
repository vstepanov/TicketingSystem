"use client";

/**
 * Textarea (plan §5.2) — labelled multi-line input with inline error support.
 *
 * Mirrors {@link TextField}: the `<label>` is tied to the control via
 * `htmlFor`/`id`; when an `error` is present the control gets `aria-invalid` and
 * `aria-describedby` pointing at the {@link FieldError}. Styling is inline off
 * the monochrome design tokens (§5.1). Used for the optional epic description
 * (S17) and the ticket body / comment box (S19).
 */
import {
  useId,
  type CSSProperties,
  type TextareaHTMLAttributes,
} from "react";

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

const TEXTAREA_STYLE: CSSProperties = {
  minHeight: "80px",
  padding: "var(--space-2) var(--space-3)",
  fontSize: "var(--text-base)",
  fontFamily: "inherit",
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-md)",
  width: "100%",
  resize: "vertical",
};

const TEXTAREA_ERROR_STYLE: CSSProperties = {
  borderColor: "var(--color-danger)",
};

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  /** Visible field label, tied to the control via `htmlFor`. */
  label: string;
  /** Inline validation message; when set the control is marked invalid. */
  error?: string | null;
}

export function Textarea({
  label,
  error,
  style,
  required,
  ...rest
}: TextareaProps) {
  const textareaId = useId();
  const errorId = `${textareaId}-error`;

  return (
    <div style={FIELD_STYLE}>
      <label htmlFor={textareaId} style={LABEL_STYLE}>
        {label}
      </label>
      <textarea
        id={textareaId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          ...TEXTAREA_STYLE,
          ...(error ? TEXTAREA_ERROR_STYLE : {}),
          ...style,
        }}
        {...rest}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
