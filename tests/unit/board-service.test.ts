import { describe, expect, it } from "vitest";

import {
  BOARD_COLUMN_ORDER,
  boardQuerySchema,
  groupIntoColumns,
} from "@/server/services/board.service";
import type { BoardCardRow } from "@/server/repositories/ticket.repo";

const TEAM = "11111111-1111-1111-1111-111111111111";
const EPIC = "22222222-2222-2222-2222-222222222222";

function card(overrides: Partial<BoardCardRow>): BoardCardRow {
  return {
    id: overrides.id ?? "t-" + Math.random().toString(36).slice(2),
    title: overrides.title ?? "Ticket",
    type: overrides.type ?? "bug",
    state: overrides.state ?? "new",
    epicTitle: overrides.epicTitle ?? null,
    modifiedAt: overrides.modifiedAt ?? new Date("2020-01-01T00:00:00.000Z"),
  };
}

describe("groupIntoColumns (pure, plan §4.8)", () => {
  it("always returns all five columns in board order, even when empty", () => {
    const view = groupIntoColumns(TEAM, []);
    expect(Object.keys(view.columns)).toEqual([
      "new",
      "ready_for_implementation",
      "in_progress",
      "ready_for_acceptance",
      "done",
    ]);
    for (const state of BOARD_COLUMN_ORDER) {
      expect(view.columns[state]).toEqual({ count: 0, tickets: [] });
    }
    expect(view.total).toBe(0);
    expect(view.teamId).toBe(TEAM);
  });

  it("groups rows into their state columns and drops the state field from cards", () => {
    const view = groupIntoColumns(TEAM, [
      card({ id: "a", state: "new" }),
      card({ id: "b", state: "done" }),
      card({ id: "c", state: "done" }),
    ]);
    expect(view.columns.new.tickets.map((t) => t.id)).toEqual(["a"]);
    expect(view.columns.done.tickets.map((t) => t.id)).toEqual(["b", "c"]);
    expect(view.columns.in_progress.tickets).toEqual([]);
    // Cards carry only the §4.8 fields (no `state`).
    expect(Object.keys(view.columns.new.tickets[0]).sort()).toEqual([
      "epicTitle",
      "id",
      "modifiedAt",
      "title",
      "type",
    ]);
  });

  it("preserves incoming order within a column (modified_at DESC from the query)", () => {
    // The repo returns rows already ordered modified_at DESC; grouping keeps it.
    const view = groupIntoColumns(TEAM, [
      card({ id: "newest", state: "new", modifiedAt: new Date("2023-03-03") }),
      card({ id: "mid", state: "new", modifiedAt: new Date("2022-02-02") }),
      card({ id: "oldest", state: "new", modifiedAt: new Date("2021-01-01") }),
    ]);
    expect(view.columns.new.tickets.map((t) => t.id)).toEqual([
      "newest",
      "mid",
      "oldest",
    ]);
  });

  it("counts are per-column and total is their sum", () => {
    const view = groupIntoColumns(TEAM, [
      card({ state: "new" }),
      card({ state: "new" }),
      card({ state: "in_progress" }),
      card({ state: "done" }),
      card({ state: "done" }),
      card({ state: "done" }),
    ]);
    expect(view.columns.new.count).toBe(2);
    expect(view.columns.ready_for_implementation.count).toBe(0);
    expect(view.columns.in_progress.count).toBe(1);
    expect(view.columns.done.count).toBe(3);
    expect(view.total).toBe(6);
  });

  it("carries epicTitle through (nullable)", () => {
    const view = groupIntoColumns(TEAM, [
      card({ id: "e", state: "new", epicTitle: "Login flow" }),
      card({ id: "n", state: "new", epicTitle: null }),
    ]);
    expect(view.columns.new.tickets[0].epicTitle).toBe("Login flow");
    expect(view.columns.new.tickets[1].epicTitle).toBeNull();
  });
});

describe("boardQuerySchema (validation, plan §4.8)", () => {
  it("requires a valid teamId UUID", () => {
    expect(boardQuerySchema.safeParse({}).success).toBe(false);
    expect(boardQuerySchema.safeParse({ teamId: "nope" }).success).toBe(false);
    expect(boardQuerySchema.safeParse({ teamId: TEAM }).success).toBe(true);
  });

  it("accepts optional valid type/epicId/q and rejects a bad enum", () => {
    expect(
      boardQuerySchema.safeParse({ teamId: TEAM, type: "feature" }).success,
    ).toBe(true);
    expect(
      boardQuerySchema.safeParse({ teamId: TEAM, type: "task" }).success,
    ).toBe(false);
    expect(
      boardQuerySchema.safeParse({ teamId: TEAM, epicId: EPIC }).success,
    ).toBe(true);
    expect(
      boardQuerySchema.safeParse({ teamId: TEAM, epicId: "x" }).success,
    ).toBe(false);
  });

  it("trims q", () => {
    const parsed = boardQuerySchema.parse({ teamId: TEAM, q: "  bug  " });
    expect(parsed.q).toBe("bug");
  });
});
