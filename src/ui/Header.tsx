"use client";

/**
 * Header (plan §5.1) — persistent app header on authenticated screens.
 *
 * Layout: brand "TICKET TRACKER" (left) · nav tabs Board/Teams/Epics (center) ·
 * UserMenu (right). Monochrome tokens from §5.1.
 */
import Link from "next/link";
import type { CSSProperties } from "react";

import { NavTabs } from "./NavTabs";
import { UserMenu } from "./UserMenu";

const HEADER_STYLE: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  height: "var(--header-height)",
  background: "var(--color-surface)",
  borderBottom: "1px solid var(--color-border)",
};

const INNER_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  height: "100%",
  maxWidth: "var(--content-max-width)",
  margin: "0 auto",
  padding: "0 var(--space-5)",
};

const BRAND_STYLE: CSSProperties = {
  fontSize: "var(--text-lg)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "var(--color-text)",
  justifySelf: "start",
};

export function Header() {
  return (
    <header style={HEADER_STYLE}>
      <div style={INNER_STYLE}>
        <Link href="/board" style={BRAND_STYLE}>
          TICKET TRACKER
        </Link>
        <div style={{ justifySelf: "center" }}>
          <NavTabs />
        </div>
        <div style={{ justifySelf: "end" }}>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
