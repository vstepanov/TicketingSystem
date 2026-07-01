"use client";

/**
 * Table primitives (plan §5.2) — a thin, reusable set of table building blocks.
 *
 * Rather than a data-driven "columns config" table, these expose semantic
 * elements (`Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`) pre-styled off the
 * design tokens (§5.1) so screens keep full control over cell contents (buttons,
 * pills, inline edit forms) while sharing consistent chrome. Used by the Teams
 * screen (S16) and reused by Epics (S17).
 *
 * Accessibility: renders a native `<table>` with real `<th scope>` headers
 * (plan §5.10 "table headers").
 */
import type { CSSProperties, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

const TABLE_STYLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  overflow: "hidden",
  fontSize: "var(--text-base)",
};

const TH_STYLE: CSSProperties = {
  textAlign: "left",
  padding: "var(--space-3) var(--space-4)",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  background: "var(--color-surface-muted)",
  borderBottom: "1px solid var(--color-border)",
};

const TD_STYLE: CSSProperties = {
  padding: "var(--space-3) var(--space-4)",
  color: "var(--color-text)",
  borderBottom: "1px solid var(--color-border)",
  verticalAlign: "middle",
};

export function Table({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <table style={{ ...TABLE_STYLE, ...style }}>{children}</table>;
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <tr style={style}>{children}</tr>;
}

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
}

export function Th({ children, style, scope = "col", ...rest }: ThProps) {
  return (
    <th scope={scope} style={{ ...TH_STYLE, ...style }} {...rest}>
      {children}
    </th>
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
}

export function Td({ children, style, ...rest }: TdProps) {
  return (
    <td style={{ ...TD_STYLE, ...style }} {...rest}>
      {children}
    </td>
  );
}
