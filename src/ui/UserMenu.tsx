"use client";

/**
 * UserMenu (plan §5.1) — right-aligned menu showing the user's email + caret,
 * with a Log out action.
 *
 * A lightweight disclosure: the trigger button (email + caret) toggles a small
 * popover containing the Log out item. Clicking outside or pressing Escape
 * closes it. Log out delegates to the auth context (`POST /api/auth/logout` →
 * clear state → redirect to /login).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useAuth } from "@/lib/auth-context";

const TRIGGER_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-2)",
  height: "34px",
  padding: "0 var(--space-3)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  color: "var(--color-text)",
  fontSize: "var(--text-base)",
  fontFamily: "inherit",
  cursor: "pointer",
};

const MENU_STYLE: CSSProperties = {
  position: "absolute",
  top: "calc(100% + var(--space-2))",
  right: 0,
  minWidth: "160px",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-md)",
  padding: "var(--space-1)",
  zIndex: 20,
};

const ITEM_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "var(--space-2) var(--space-3)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-text)",
  fontSize: "var(--text-base)",
  fontFamily: "inherit",
  cursor: "pointer",
};

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (user === null) {
    return null;
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        style={TRIGGER_STYLE}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{user.email}</span>
        <span aria-hidden="true" style={{ color: "var(--color-text-muted)" }}>
          ▾
        </span>
      </button>

      {open && (
        <div role="menu" style={MENU_STYLE}>
          <button
            type="button"
            role="menuitem"
            style={ITEM_STYLE}
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
