"use client";

/**
 * FieldError (plan §5.2) — inline validation message for a form field.
 *
 * Renders a small danger-coloured message and nothing when there is no error, so
 * callers can render it unconditionally. The element carries a stable `id` so the
 * associated input can reference it via `aria-describedby` (plan §5.4 a11y). It
 * uses `role="alert"` so assistive tech announces validation as it appears.
 */
import type { CSSProperties } from "react";

const STYLE: CSSProperties = {
  color: "var(--color-danger)",
  fontSize: "var(--text-sm)",
  marginTop: "var(--space-1)",
};

export interface FieldErrorProps {
  /** The message to display. When falsy, nothing is rendered. */
  children?: string | null;
  /** Stable id so an input can point at it via `aria-describedby`. */
  id?: string;
}

export function FieldError({ children, id }: FieldErrorProps) {
  if (!children) {
    return null;
  }
  return (
    <p id={id} role="alert" style={STYLE}>
      {children}
    </p>
  );
}
