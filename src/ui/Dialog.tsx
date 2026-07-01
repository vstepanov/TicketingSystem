"use client";

/**
 * Dialog + ConfirmDialog (plan §5.2) — modal primitives.
 *
 * `Dialog` is a focus-trapped, `role="dialog"` modal overlay: it moves focus in
 * on open, restores it on close, traps Tab within the panel, and closes on
 * Escape or backdrop click (plan §5.10 "dialog focus trap"). `ConfirmDialog`
 * builds on it for the common confirm/cancel case (e.g. deleting a team, S16;
 * deleting an epic/ticket, S17/S19).
 *
 * Styling is inline off the design tokens (§5.1) to stay consistent with the
 * other primitives (the scaffold has no CSS pipeline).
 */
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Button } from "./Button";

const OVERLAY_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(23, 24, 26, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-4)",
  zIndex: 50,
};

const PANEL_STYLE: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-md)",
  width: "100%",
  maxWidth: "420px",
  padding: "var(--space-5)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-lg)",
  fontWeight: 600,
  color: "var(--color-text)",
};

const BODY_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-base)",
  color: "var(--color-text-muted)",
};

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--space-2)",
  marginTop: "var(--space-2)",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  /** Whether the dialog is mounted/visible. */
  open: boolean;
  /** Accessible dialog title (rendered as the heading). */
  title: string;
  /** Called on Escape, backdrop click, or a Cancel action. */
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`).current;
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Move focus into the panel (first focusable, else the panel itself).
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel ?? null;
    target?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      style={OVERLAY_STYLE}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={PANEL_STYLE}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} style={TITLE_STYLE}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Descriptive body text explaining the consequence of confirming. */
  message: ReactNode;
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Whether the confirm action is in flight (shows disabled state). */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <p style={BODY_STYLE}>{message}</p>
      <div style={ACTIONS_STYLE}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
