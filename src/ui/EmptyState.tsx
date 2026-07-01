"use client";

/**
 * EmptyState (plan §5.2, §5.3) — friendly placeholder for empty collections.
 *
 * Used when a table/list has no rows (e.g. "No teams yet — create your first
 * team."). Renders a centered message with an optional call-to-action so screens
 * can offer the natural next step. Styling is inline off the design tokens (§5.1).
 */
import type { CSSProperties, ReactNode } from "react";

const WRAP_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-3)",
  padding: "var(--space-6) var(--space-4)",
  textAlign: "center",
  color: "var(--color-text-muted)",
};

const MESSAGE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-base)",
};

export interface EmptyStateProps {
  /** The main message, e.g. "No teams yet — create your first team." */
  message: ReactNode;
  /** Optional call-to-action (e.g. a Button) rendered below the message. */
  action?: ReactNode;
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div style={WRAP_STYLE} role="status">
      <p style={MESSAGE_STYLE}>{message}</p>
      {action}
    </div>
  );
}
