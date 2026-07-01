"use client";

/**
 * EpicRow (plan §5.11 wireframe-5) — one row of the Epics table.
 *
 * Displays the title with a truncated description beneath, the ticket count (as
 * a {@link Pill}), the Modified timestamp (UTC), and the Edit / Delete actions:
 *   - Edit asks the parent to open the right-side {@link EditEpicPanel} (team is
 *     immutable there).
 *   - Delete is DISABLED when `canDelete === false` (tickets reference the epic),
 *     with an explanatory tooltip/`aria-disabled` (§5.11). When enabled the
 *     parent opens a ConfirmDialog before deleting.
 */
import type { CSSProperties } from "react";

import { Button } from "@/ui/Button";
import { Pill } from "@/ui/Pill";
import { Td, Tr } from "@/ui/Table";
import type { Epic } from "./use-epics";

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
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

/** Serialize an ISO timestamp to a compact UTC display (plan §5.11, all UTC). */
function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

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
      <Td>
        <Pill>{epic.ticketCount}</Pill>
      </Td>
      <Td style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
        {formatUtc(epic.modifiedAt)}
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
          >
            Delete
          </Button>
        </div>
      </Td>
    </Tr>
  );
}
