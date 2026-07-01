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
  /**
   * Route prefixes that should also highlight this tab. Defaults to `[href]`.
   * Board owns the ticket routes (`/tickets/new`, `/tickets/{id}`) — they are
   * reached from the board and have no tab of their own — so Board stays active
   * there instead of leaving every tab deselected.
   */
  activePrefixes?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Board", href: "/board", activePrefixes: ["/board", "/tickets"] },
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

/** Is `item` the active tab for `pathname`? Matches any of its route prefixes. */
function isActive(pathname: string, item: NavItem): boolean {
  const prefixes = item.activePrefixes ?? [item.href];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function NavTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Primary">
      <ul style={LIST_STYLE}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
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
