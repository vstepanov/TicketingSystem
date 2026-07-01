"use client";

/**
 * FilterBar (plan §5.7, wireframe-1) — the board's filter row.
 *
 * Controls (all combine with AND and drive the board query, §4.8):
 *   - Search title: a debounced text input. Keystrokes update local input state
 *     immediately (responsive typing) but only commit to the query `q` after a
 *     short debounce, so a burst of typing triggers one refetch rather than one
 *     per key. Matching is case-insensitive title substring (server-side, §4.8).
 *   - Type: `bug | feature | fix | all` select.
 *   - Epic: an epic of the selected team, or `all` (options from §4.5).
 *   - Clear: resets every filter to its default.
 *   - Result count: "{n} tickets" reflecting the current (filtered) total.
 *
 * The bar is controlled — the parent owns the committed {@link BoardFilters} and
 * receives changes via `onChange`. Only the search box keeps transient local
 * state for the debounce; it re-syncs if the committed `q` changes externally
 * (e.g. Clear).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/ui/Button";
import { Select } from "@/ui/Select";
import { TextField } from "@/ui/TextField";
import {
  EMPTY_FILTERS,
  type BoardFilters,
  type EpicOption,
  type TicketType,
} from "./use-board";

const BAR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "var(--space-3)",
  flexWrap: "wrap",
  padding: "var(--space-3)",
  marginBottom: "var(--space-4)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
};

const COUNT_STYLE: CSSProperties = {
  marginLeft: "auto",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
  paddingBottom: "var(--space-2)",
};

const SEARCH_DEBOUNCE_MS = 300;

const TYPE_OPTIONS: { value: TicketType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "fix", label: "Fix" },
];

export function FilterBar({
  filters,
  epics,
  total,
  onChange,
}: {
  filters: BoardFilters;
  epics: EpicOption[];
  total: number;
  onChange: (next: BoardFilters) => void;
}) {
  // Transient search text for the debounce; committed value lives in `filters.q`.
  const [searchText, setSearchText] = useState(filters.q);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync the input if the committed q changes externally (e.g. Clear).
  useEffect(() => {
    setSearchText(filters.q);
  }, [filters.q]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function commitSearch(value: string) {
    setSearchText(value);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      onChange({ ...filters, q: value });
    }, SEARCH_DEBOUNCE_MS);
  }

  const isCleared =
    filters.type === "all" &&
    filters.epicId === "all" &&
    filters.q.trim().length === 0 &&
    searchText.trim().length === 0;

  return (
    <div style={BAR_STYLE}>
      <div style={{ minWidth: "220px" }}>
        <TextField
          label="Search"
          type="search"
          placeholder="Search title…"
          value={searchText}
          onChange={(e) => commitSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div style={{ minWidth: "160px" }}>
        <Select
          label="Type"
          value={filters.type}
          onChange={(e) =>
            onChange({ ...filters, type: e.target.value as BoardFilters["type"] })
          }
        >
          <option value="all">All types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      <div style={{ minWidth: "180px" }}>
        <Select
          label="Epic"
          value={filters.epicId}
          onChange={(e) => onChange({ ...filters, epicId: e.target.value })}
        >
          <option value="all">All epics</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.title}
            </option>
          ))}
        </Select>
      </div>

      <Button
        variant="secondary"
        onClick={() => onChange({ ...EMPTY_FILTERS })}
        disabled={isCleared}
      >
        Clear
      </Button>

      <span style={COUNT_STYLE}>
        {total} {total === 1 ? "ticket" : "tickets"}
      </span>
    </div>
  );
}
