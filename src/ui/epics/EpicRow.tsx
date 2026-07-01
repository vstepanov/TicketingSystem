"use client";

/**
 * EpicRow (plan §5.11 wireframe-5) — one row of the Epics table.
 *
 * Displays the title with a truncated description beneath, the ticket count (a
 * plain centered number), the Modified timestamp (relative), and the actions:
 *   - Edit (outlined text button) asks the parent to open the right-side
 *     {@link EditEpicPanel} (team is immutable there).
 *   - Delete is a small square "×" icon button, DISABLED/grayed when
 *     `canDelete === false` (tickets reference the epic), with an explanatory
 *     tooltip/`aria-disabled` (§5.11). When enabled the parent opens a
 *     ConfirmDialog before deleting.
 */
import type { CSSProperties } from "react";

import { Button } from "@/ui/Button";
import { Td, Tr } from "@/ui/Table";
import { formatRelative } from "@/ui/format-time";
import type { Epic } from "./use-epics";

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
};

// Small square "×" icon button for delete (mockup 05).
const DELETE_BUTTON_STYLE: CSSProperties = {
  width: "34px",
  padding: 0,
  fontSize: "var(--text-lg)",
  lineHeight: 1,
};

const TITLE_STYLE: CSSProperties = {
  fontWeight: 500,
};

const DESCRIPTION_STYLE: CSSProperties = {
  margin: "var(--space-1) 0 0",
  color: "var(--color-text-muted)",
  fontSize: "var(--text-sm)",
  maxWidth: "420px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const DELETE_DISABLED_HINT =
  "Delete is disabled while tickets reference the epic.";

export function EpicRow({
  epic,
  onRequestEdit,
  onRequestDelete,
}: {
  epic: Epic;
  onRequestEdit: (epic: Epic) => void;
  onRequestDelete: (epic: Epic) => void;
}) {
  return (
    <Tr>
      <Td>
        <div style={TITLE_STYLE}>{epic.title}</div>
        {epic.description ? (
          <p style={DESCRIPTION_STYLE} title={epic.description}>
            {epic.description}
          </p>
        ) : null}
      </Td>
      <Td align="right">{epic.ticketCount}</Td>
      <Td
        align="right"
        style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}
      >
        {formatRelative(epic.modifiedAt)}
      </Td>
      <Td>
        <div style={ACTIONS_STYLE}>
          <Button variant="secondary" onClick={() => onRequestEdit(epic)}>
            Edit
          </Button>
          <Button
            variant="secondary"
            onClick={() => onRequestDelete(epic)}
            disabled={!epic.canDelete}
            title={epic.canDelete ? undefined : DELETE_DISABLED_HINT}
            aria-label="Delete epic"
            style={DELETE_BUTTON_STYLE}
          >
            ×
          </Button>
        </div>
      </Td>
    </Tr>
  );
}
