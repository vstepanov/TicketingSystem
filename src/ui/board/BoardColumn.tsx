"use client";

/**
 * BoardColumn (plan §5.7, wireframe-1) — one of the five Kanban columns.
 *
 * Renders the column header (UI label + count {@link Pill}) and the list of
 * {@link TicketCard}s. The column body is a `@dnd-kit` DROP TARGET
 * ({@link useDroppable}) whose id IS the canonical {@link TicketState}, so the
 * board's drag-end handler reads `over.id` directly as the destination state.
 *
 * Accessibility (§5.7): the column is a labelled list (`role="list"` +
 * `aria-label` naming the column and its count) so keyboard/screen-reader users
 * can perceive column boundaries during a keyboard drag. Empty columns stay
 * visible (they still render the header and an empty, still-droppable body) so
 * cards can be dropped into an empty state.
 */
import { useDroppable } from "@dnd-kit/core";
import type { CSSProperties } from "react";

import { Pill } from "@/ui/Pill";
import { TicketCard } from "./TicketCard";
import { STATE_LABELS, type BoardCard, type TicketState } from "./use-board";

const COLUMN_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  // Keep every column the same tall shape even when empty (mockup 01); the
  // board grid stretches them to the tallest, this sets the shared baseline.
  minHeight: "600px",
  // Column group is a touch lighter than the page background (mockup 01).
  background: "var(--color-board-column)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
};

// Circular count badge in the column header (mockup 01). The column body is a
// light grey, so the circle uses a darker grey (`--color-board-count`) —
// otherwise it blends into the column and looks like there is no circle at all.
const COUNT_STYLE: CSSProperties = {
  width: "28px",
  height: "28px",
  padding: 0,
  background: "var(--color-board-count)",
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  padding: "var(--space-3)",
  borderBottom: "1px solid var(--color-border)",
};

const LABEL_STYLE: CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "var(--color-text)",
};

const BODY_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-3)",
  minHeight: "80px",
  flex: 1,
};

const BODY_OVER_STYLE: CSSProperties = {
  background: "var(--color-surface-hover, rgba(0,0,0,0.03))",
};

export function BoardColumn({
  state,
  count,
  cards,
}: {
  state: TicketState;
  count: number;
  cards: BoardCard[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: state,
    data: { type: "column" },
  });

  const label = STATE_LABELS[state];

  return (
    <section style={COLUMN_STYLE} aria-label={`${label} column`}>
      <div style={HEADER_STYLE}>
        <span style={LABEL_STYLE}>{label}</span>
        <Pill style={COUNT_STYLE}>{count}</Pill>
      </div>
      <div
        ref={setNodeRef}
        role="list"
        aria-label={`${label}, ${count} tickets`}
        style={{ ...BODY_STYLE, ...(isOver ? BODY_OVER_STYLE : {}) }}
      >
        {cards.map((card) => (
          <div role="listitem" key={card.id}>
            <TicketCard card={card} />
          </div>
        ))}
      </div>
    </section>
  );
}
