"use client";

/**
 * Pill (plan §5.2) — a small count/number chip.
 *
 * Used for column/table counts (e.g. ticket & epic counts on the Teams table,
 * board column counts). Monochrome by default; a `tone` can tint it for emphasis.
 * Purely presentational — styling is inline off the design tokens (§5.1),
 * consistent with the other primitives (the scaffold has no CSS pipeline).
 */
import type { CSSProperties, ReactNode } from "react";

export type PillTone = "neutral" | "muted";

const BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "22px",
  height: "20px",
  padding: "0 var(--space-2)",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  lineHeight: 1,
  borderRadius: "999px",
};

const TONE_STYLE: Record<PillTone, CSSProperties> = {
  neutral: {
    background: "var(--color-surface-muted)",
    color: "var(--color-text)",
  },
  muted: {
    background: "var(--color-surface-muted)",
    color: "var(--color-text-muted)",
  },
};

export interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  style?: CSSProperties;
}

export function Pill({ children, tone = "neutral", style }: PillProps) {
  return (
    <span style={{ ...BASE_STYLE, ...TONE_STYLE[tone], ...style }}>{children}</span>
  );
}
