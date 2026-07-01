"use client";

/**
 * Spinner (plan §5.2, §5.3) — small inline loading indicator.
 *
 * Used inside submit buttons (button spinner on submit) and for the verify
 * screen's "Verifying…" state. Purely decorative, so it is `aria-hidden`; callers
 * provide the accessible text (e.g. a visible "Verifying…" label in a live region).
 */
import type { CSSProperties } from "react";

export interface SpinnerProps {
  /** Diameter in pixels. Defaults to 16 (fits inside a 34px button). */
  size?: number;
  /** Stroke/border colour. Defaults to currentColor so it inherits button text. */
  color?: string;
}

export function Spinner({ size = 16, color = "currentColor" }: SpinnerProps) {
  const style: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    border: `2px solid ${color}`,
    borderTopColor: "transparent",
    borderRadius: "50%",
    animation: "ticket-spin 0.6s linear infinite",
    verticalAlign: "middle",
  };

  return (
    <>
      <span aria-hidden="true" style={style} />
      <style>{"@keyframes ticket-spin { to { transform: rotate(360deg); } }"}</style>
    </>
  );
}
