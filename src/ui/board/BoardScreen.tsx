"use client";

/**
 * BoardScreen (plan §5.7, wireframe-1) — the Kanban board screen body.
 *
 * Composition:
 *   - A controls row: a Team {@link Select} (from `GET /api/teams`) on the left
 *     and a "+ New ticket" primary link on the right (detail screen is S19).
 *   - A {@link FilterBar} (debounced title search, type, epic, clear, count) whose
 *     values drive the board query — the query key includes every filter so any
 *     change refetches with AND semantics (§4.8).
 *   - Five {@link BoardColumn}s in canonical order, each always visible (even
 *     empty), with a per-column count and cards ordered modified_at DESC.
 *
 * Selection: the effective teamId is held in React state and mirrored to the
 * `teamId` URL query param (deep-linkable, §5.7) — never localStorage (§2.1).
 * If no team exists → prompt to create one; if none selected → prompt to select.
 *
 * Drag-and-drop (§5.7, §2.8):
 *   - `@dnd-kit` DndContext with a PointerSensor AND a KeyboardSensor so cards
 *     can be moved by keyboard (Space to pick up, arrows to move between columns,
 *     Space to drop). `accessibility.announcements` narrate pick-up/move/drop via
 *     dnd-kit's live region.
 *   - On drop over a different column, the move is OPTIMISTIC: the cached board is
 *     rewritten immediately ({@link moveCardInBoard}) then `PATCH /state` fires.
 *     On success the cache is kept (a background refetch reconciles ordering); on
 *     ANY failure the previous board snapshot is restored (card returns to its
 *     original column) and an error toast is shown (explicit requirement §5.7).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/ui/Button";
import { Select } from "@/ui/Select";
import { Spinner } from "@/ui/Spinner";
import { EmptyState } from "@/ui/EmptyState";
import { useToast } from "@/ui/Toast";
import { BoardColumn } from "./BoardColumn";
import { FilterBar } from "./FilterBar";
import {
  BOARD_COLUMN_ORDER,
  EMPTY_FILTERS,
  STATE_LABELS,
  performOptimisticMove,
  useBoard,
  useEpicOptions,
  useMoveTicketState,
  useTeamOptions,
  type BoardFilters,
  type TicketState,
} from "./use-board";

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "var(--space-4)",
  marginBottom: "var(--space-4)",
  flexWrap: "wrap",
};

const CONTROLS_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "var(--space-3)",
};

const NEW_TICKET_LINK_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: "34px",
  padding: "0 var(--space-4)",
  fontSize: "var(--text-base)",
  fontWeight: 500,
  borderRadius: "var(--radius-md)",
  background: "var(--color-primary)",
  color: "var(--color-primary-text)",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const LOADING_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "var(--space-6)",
  color: "var(--color-text-muted)",
};

const ERROR_STYLE: CSSProperties = {
  padding: "var(--space-4)",
  color: "var(--color-danger)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  background: "var(--color-surface)",
};

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(220px, 1fr))",
  gap: "var(--space-3)",
  overflowX: "auto",
  alignItems: "start",
};

const SKELETON_CARD_STYLE: CSSProperties = {
  height: "72px",
  background: "var(--color-surface-muted)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  opacity: 0.6,
};

const MOVE_ERROR_MESSAGE = "Could not move the ticket. It was returned to its column.";

/** Is a droppable id one of the five canonical states? */
function isTicketState(value: unknown): value is TicketState {
  return (
    typeof value === "string" &&
    (BOARD_COLUMN_ORDER as readonly string[]).includes(value)
  );
}

export function BoardScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTeamId = searchParams.get("teamId");

  const queryClient = useQueryClient();
  const toast = useToast();

  const teamsQuery = useTeamOptions();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(urlTeamId);
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);

  // Resolve the effective selection once teams load: honour a valid URL/state
  // teamId, otherwise default to the first team. Never localStorage (§2.1).
  useEffect(() => {
    if (teams.length === 0) {
      return;
    }
    const stillValid =
      selectedTeamId !== null && teams.some((t) => t.id === selectedTeamId);
    if (!stillValid) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  function selectTeam(teamId: string) {
    setSelectedTeamId(teamId);
    setFilters(EMPTY_FILTERS);
    const params = new URLSearchParams(searchParams.toString());
    params.set("teamId", teamId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const boardQuery = useBoard(selectedTeamId, filters);
  const epicsQuery = useEpicOptions(selectedTeamId);
  const moveState = useMoveTicketState();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor),
  );

  /**
   * Handle a completed drag. Extracted so the optimistic-move + rollback logic is
   * testable without simulating pointer/keyboard events in jsdom: a test can call
   * this with a synthesized {@link DragEndEvent}.
   */
  async function handleDragEnd(event: DragEndEvent) {
    const activeId = event.active?.id;
    const overId = event.over?.id;
    if (
      selectedTeamId === null ||
      typeof activeId !== "string" ||
      !isTicketState(overId)
    ) {
      return;
    }

    await performOptimisticMove({
      queryClient,
      teamId: selectedTeamId,
      filters,
      cardId: activeId,
      toState: overId,
      mutate: (vars) => moveState.mutateAsync(vars),
      onError: () => toast.error(MOVE_ERROR_MESSAGE),
    });
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const board = boardQuery.data;
  const epics = epicsQuery.data ?? [];

  return (
    <section>
      <div style={HEADER_STYLE}>
        <div style={CONTROLS_STYLE}>
          {teams.length > 0 && (
            <div style={{ minWidth: "220px" }}>
              <Select
                label="Team"
                value={selectedTeamId ?? ""}
                onChange={(e) => selectTeam(e.target.value)}
                disabled={teamsQuery.isLoading}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        {selectedTeamId && (
          <Link
            href={`/tickets/new?teamId=${encodeURIComponent(selectedTeamId)}`}
            style={NEW_TICKET_LINK_STYLE}
          >
            + New ticket
          </Link>
        )}
      </div>

      {teamsQuery.isLoading ? (
        <div style={LOADING_STYLE} role="status" aria-live="polite">
          <Spinner /> Loading teams…
        </div>
      ) : teamsQuery.isError ? (
        <div style={ERROR_STYLE} role="alert">
          <p style={{ margin: "0 0 var(--space-3)" }}>
            Could not load teams. Please try again.
          </p>
          <Button variant="secondary" onClick={() => void teamsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          message="No teams yet — create a team before using the board."
          action={
            <Link href="/teams" style={NEW_TICKET_LINK_STYLE}>
              Go to Teams
            </Link>
          }
        />
      ) : !selectedTeamId ? (
        <EmptyState message="Select a team to view its board." />
      ) : (
        <>
          <FilterBar
            filters={filters}
            epics={epics}
            total={board?.total ?? 0}
            onChange={setFilters}
          />

          {boardQuery.isError ? (
            <div style={ERROR_STYLE} role="alert">
              <p style={{ margin: "0 0 var(--space-3)" }}>
                Could not load the board for {selectedTeam?.name ?? "this team"}.
                Please try again.
              </p>
              <Button
                variant="secondary"
                onClick={() => void boardQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragEnd={handleDragEnd}
              accessibility={{
                announcements: {
                  onDragStart: ({ active }) =>
                    `Picked up ticket ${String(active.id)}.`,
                  onDragOver: ({ over }) =>
                    over
                      ? `Ticket is over the ${
                          STATE_LABELS[over.id as TicketState] ?? over.id
                        } column.`
                      : "Ticket is no longer over a column.",
                  onDragEnd: ({ over }) =>
                    over
                      ? `Ticket dropped into the ${
                          STATE_LABELS[over.id as TicketState] ?? over.id
                        } column.`
                      : "Ticket dropped.",
                  onDragCancel: () => "Move cancelled. Ticket returned.",
                },
              }}
            >
              <div style={GRID_STYLE}>
                {BOARD_COLUMN_ORDER.map((state) => {
                  const column = board?.columns[state];
                  if (boardQuery.isLoading || !column) {
                    return (
                      <BoardColumnSkeleton key={state} state={state} />
                    );
                  }
                  return (
                    <BoardColumn
                      key={state}
                      state={state}
                      count={column.count}
                      cards={column.tickets}
                    />
                  );
                })}
              </div>
            </DndContext>
          )}
        </>
      )}
    </section>
  );
}

/** A single column's loading skeleton (§5.3 "loading skeletons for columns"). */
function BoardColumnSkeleton({ state }: { state: TicketState }) {
  return (
    <section
      aria-label={`${STATE_LABELS[state]} column`}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface-muted)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div
        style={{
          padding: "var(--space-3)",
          borderBottom: "1px solid var(--color-border)",
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {STATE_LABELS[state]}
      </div>
      <div
        role="status"
        aria-label="Loading tickets"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          padding: "var(--space-3)",
        }}
      >
        <div style={SKELETON_CARD_STYLE} />
        <div style={SKELETON_CARD_STYLE} />
      </div>
    </section>
  );
}
