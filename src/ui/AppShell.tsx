"use client";

/**
 * AppShell (plan §5.1) — the authenticated application frame.
 *
 * Renders the persistent {@link Header} plus the active route's content in the
 * body region. It reads auth state from the context: while the `/me` bootstrap
 * is in flight it shows a minimal loading state, and it only renders the shell
 * once a user is present (anonymous visitors are redirected to /login by the
 * AuthProvider guard, so the shell never flashes for them).
 */
import type { CSSProperties, ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";
import { Header } from "./Header";

const MAIN_STYLE: CSSProperties = {
  maxWidth: "var(--content-max-width)",
  margin: "0 auto",
  padding: "var(--space-5)",
};

const LOADING_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
  color: "var(--color-text-muted)",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={LOADING_STYLE} role="status" aria-live="polite">
        Loading…
      </div>
    );
  }

  // Anonymous: the guard redirects to /login; render nothing to avoid a flash.
  if (user === null) {
    return null;
  }

  return (
    <>
      <Header />
      <main style={MAIN_STYLE}>{children}</main>
    </>
  );
}
