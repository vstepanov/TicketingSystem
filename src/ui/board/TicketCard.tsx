"use client";

/**
 * TicketCard (plan §5.7, wireframe-1) — one draggable card on the board.
 *
 * Shows the type badge, the title, the epic title (when the ticket references
 * one), and a UTC "modified" timestamp. The whole card is a link to the ticket
 * detail route `/tickets/{id}` (built in S19; navigation is wired now, §5.7).
 *
 * Drag-and-drop: the card registers as a `@dnd-kit` draggable
 * ({@link useDraggable}). The mockup shows no visible handle, so the drag
 * attributes/listeners are spread onto the whole card container — the card IS the
 * drag source. It carries an `aria-label` naming the ticket plus `tabIndex` so
 * keyboard users can still pick it up/move it (Space to pick up, arrows to move,
 * Space to drop — see the board's KeyboardSensor). The title is a `<Link>` to the
 * detail route; the PointerSensor's 4px activation distance means a plain click
 * still navigates rather than starting a drag.
 */
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

import { formatRelative } from "@/ui/format-time";
import type { BoardCard, TicketType } from "./use-board";

const CARD_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
  padding: "var(--space-4)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-sm)",
  cursor: "grab",
};

const BADGE_STYLE: CSSProperties = {
  // Hug the word: sized to content, doesn't stretch to the card width.
  display: "inline-flex",
  alignSelf: "flex-start",
  alignItems: "center",
  padding: "2px 6px",
  fontSize: "11px",
  fontWeight: 600,
  lineHeight: 1.2,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderRadius: "999px",
  background: "var(--color-surface-muted)",
  color: "var(--color-text)",
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

const TIMESTAMP_STYLE: CSSProperties = {
  ...META_STYLE,
  alignSelf: "flex-end",
  textAlign: "right",
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
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`card-${card.id}`}
      {...attributes}
      {...listeners}
      aria-label={`Move ticket: ${card.title}`}
    >
      <span style={BADGE_STYLE}>{TYPE_LABEL[card.type]}</span>
      <Link href={`/tickets/${card.id}`} style={TITLE_STYLE}>
        {card.title}
      </Link>
      {card.epicTitle && <div style={META_STYLE}>Epic: {card.epicTitle}</div>}
      <div style={TIMESTAMP_STYLE}>{formatRelative(card.modifiedAt)}</div>
    </div>
  );
}
