"use client";

/**
 * NavTabs (plan §5.1) — center navigation: Board · Teams · Epics.
 *
 * The tab whose route matches the current pathname is highlighted. Uses
 * `next/link` for client navigation and `usePathname` to derive the active
 * state. Marked `aria-current="page"` for accessibility.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

interface NavItem {
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Board", href: "/board" },
  { label: "Teams", href: "/teams" },
  { label: "Epics", href: "/epics" },
];

const LIST_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-1)",
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const BASE_LINK_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: "34px",
  padding: "0 var(--space-3)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-base)",
  fontWeight: 500,
  color: "var(--color-text-muted)",
};

const ACTIVE_LINK_STYLE: CSSProperties = {
  color: "var(--color-text)",
  background: "var(--color-surface-muted)",
};

/** Is `href` the active route for `pathname`? Matches the tab's route prefix. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Primary">
      <ul style={LIST_STYLE}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                style={{
                  ...BASE_LINK_STYLE,
                  ...(active ? ACTIVE_LINK_STYLE : {}),
                }}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
