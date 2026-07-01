"use client";

/**
 * TicketCard (plan §5.7, wireframe-1) — one draggable card on the board.
 *
 * Shows the type badge, the title, the epic title (when the ticket references
 * one), and a UTC "modified" timestamp. The whole card is a link to the ticket
 * detail route `/tickets/{id}` (built in S19; navigation is wired now, §5.7).
 *
 * Drag-and-drop: the card registers as a `@dnd-kit` draggable
 * ({@link useDraggable}). The drag handle attributes/listeners are spread onto a
 * dedicated handle button so the card link stays independently clickable and the
 * handle is keyboard-operable (Space/Enter to pick up, arrows to move, Space to
 * drop — see the board's KeyboardSensor). The handle carries an `aria-label`
 * naming the ticket so screen-reader announcements are meaningful.
 */
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

import { formatCompactUtc } from "@/ui/format-time";
import type { BoardCard, TicketType } from "./use-board";

const CARD_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-3)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-sm)",
};

const TOP_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
};

const BADGE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: "18px",
  padding: "0 var(--space-2)",
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderRadius: "999px",
  background: "var(--color-surface-muted)",
  color: "var(--color-text)",
};

const HANDLE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "22px",
  height: "22px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-surface)",
  color: "var(--color-text-muted)",
  cursor: "grab",
  fontFamily: "inherit",
  lineHeight: 1,
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-base)",
  fontWeight: 600,
  color: "var(--color-text)",
  textDecoration: "none",
};

const META_STYLE: CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

const TYPE_LABEL: Record<TicketType, string> = {
  bug: "Bug",
  feature: "Feature",
  fix: "Fix",
};

export function TicketCard({ card }: { card: BoardCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: card.id, data: { type: "card" } });

  const style: CSSProperties = {
    ...CARD_STYLE,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} data-testid={`card-${card.id}`}>
      <div style={TOP_ROW_STYLE}>
        <span style={BADGE_STYLE}>{TYPE_LABEL[card.type]}</span>
        <button
          type="button"
          style={HANDLE_STYLE}
          aria-label={`Move ticket: ${card.title}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
      </div>
      <Link href={`/tickets/${card.id}`} style={TITLE_STYLE}>
        {card.title}
      </Link>
      {card.epicTitle && <div style={META_STYLE}>Epic: {card.epicTitle}</div>}
      <div style={META_STYLE}>{formatCompactUtc(card.modifiedAt)}</div>
    </div>
  );
}
