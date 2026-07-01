"use client";

/**
 * AuthCard (plan §5.2, wireframe 2) — centered card shell for the public auth
 * screens (signup / login / verify result).
 *
 * Renders a vertically & horizontally centered surface with a brand line, a
 * title, an optional subtitle, and the screen's body. Monochrome tokens (§5.1).
 * The wrapper is a `<main>` landmark so the public pages have a clear content
 * region (the authenticated shell provides its own landmark elsewhere).
 */
import type { CSSProperties, ReactNode } from "react";

const WRAP_STYLE: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-5)",
  background: "var(--color-bg)",
};

const CARD_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "400px",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-md)",
  padding: "var(--space-6)",
};

const BRAND_STYLE: CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "var(--color-text-muted)",
  marginBottom: "var(--space-4)",
};

const TITLE_STYLE: CSSProperties = {
  fontSize: "var(--text-xl)",
  fontWeight: 600,
  margin: 0,
  color: "var(--color-text)",
};

const SUBTITLE_STYLE: CSSProperties = {
  fontSize: "var(--text-base)",
  color: "var(--color-text-muted)",
  margin: "var(--space-1) 0 var(--space-5)",
};

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main style={WRAP_STYLE}>
      <div style={CARD_STYLE}>
        <div style={BRAND_STYLE}>TICKET TRACKER</div>
        <h1 style={TITLE_STYLE}>{title}</h1>
        {subtitle ? <p style={SUBTITLE_STYLE}>{subtitle}</p> : null}
        {children}
      </div>
    </main>
  );
}
