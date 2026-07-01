"use client";

/**
 * TextField (plan §5.2) — labelled text input with inline error support.
 *
 * A11y (plan §5.4): the `<label>` is tied to the input via `htmlFor`/`id`; when
 * an `error` is present the input gets `aria-invalid` and `aria-describedby`
 * pointing at the {@link FieldError}. Styling is inline off the monochrome design
 * tokens (§5.1), consistent with {@link Button} (the scaffold has no CSS pipeline).
 *
 * This is the base input; {@link PasswordField} is a thin wrapper that sets
 * `type="password"`.
 */
import { useId, type CSSProperties, type InputHTMLAttributes } from "react";

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

const INPUT_STYLE: CSSProperties = {
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

const INPUT_ERROR_STYLE: CSSProperties = {
  borderColor: "var(--color-danger)",
};

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Visible field label, tied to the input via `htmlFor`. */
  label: string;
  /** Inline validation message; when set the input is marked invalid. */
  error?: string | null;
}

export function TextField({
  label,
  error,
  type = "text",
  style,
  required,
  ...rest
}: TextFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;

  return (
    <div style={FIELD_STYLE}>
      <label htmlFor={inputId} style={LABEL_STYLE}>
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          ...INPUT_STYLE,
          ...(error ? INPUT_ERROR_STYLE : {}),
          ...style,
        }}
        {...rest}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
