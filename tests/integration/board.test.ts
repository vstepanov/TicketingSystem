import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { epics, teams, tickets, users } from "@/server/db/schema";
import type { AppError } from "@/server/http/errors";
import { setupTestDb, type TestDb } from "../helpers/pg";

process.env.SESSION_SECRET ??= "board-integration-secret-of-sufficient-length!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let service: typeof import("@/server/services/board.service");

type State =
  | "new"
  | "ready_for_implementation"
  | "in_progress"
  | "ready_for_acceptance"
  | "done";
type Type = "bug" | "feature" | "fix";

const STATES: State[] = [
  "new",
  "ready_for_implementation",
  "in_progress",
  "ready_for_acceptance",
  "done",
];
const TYPES: Type[] = ["bug", "feature", "fix"];

function rand(prefix = "x"): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function insertTeamRow(name = rand("Team")): Promise<string> {
  const [row] = await ctx.db
    .insert(teams)
    .values({ name })
    .returning({ id: teams.id });
  return row.id;
}

async function insertUserRow(): Promise<string> {
  const [row] = await ctx.db
    .insert(users)
    .values({ email: `u${rand()}@example.com`, passwordHash: "x", emailVerified: true })
    .returning({ id: users.id });
  return row.id;
}

async function insertEpicRow(teamId: string, title = rand("Epic")): Promise<string> {
  const [row] = await ctx.db
    .insert(epics)
    .values({ teamId, title })
    .returning({ id: epics.id });
  return row.id;
}

async function insertTicket(fields: {
  teamId: string;
  createdBy: string;
  type: Type;
  state: State;
  title: string;
  epicId?: string | null;
  modifiedAt?: Date;
}): Promise<string> {
  const [row] = await ctx.db
    .insert(tickets)
    .values({
      teamId: fields.teamId,
      createdBy: fields.createdBy,
      type: fields.type,
      state: fields.state,
      title: fields.title,
      body: "body",
      epicId: fields.epicId ?? null,
      ...(fields.modifiedAt ? { modifiedAt: fields.modifiedAt } : {}),
    })
    .returning({ id: tickets.id });
  return row.id;
}

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected the service to throw");
}

beforeAll(async () => {
  ctx = await setupTestDb();
  service = await import("@/server/services/board.service");
});

afterAll(async () => {
  await ctx.teardown();
});

describe("board service (integration, plan §4.8)", () => {
  it("returns all five columns even when the team has no tickets", async () => {
    const teamId = await insertTeamRow();
    const view = await service.getBoard({ teamId }, ctx.db);
    expect(Object.keys(view.columns)).toEqual(STATES);
    for (const state of STATES) {
      expect(view.columns[state]).toEqual({ count: 0, tickets: [] });
    }
    expect(view.total).toBe(0);
    expect(view.teamId).toBe(teamId);
  });

  it("groups 100+ tickets into 5 columns with correct counts + total", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();

    // 120 tickets spread deterministically across the five states.
    const perState = 24;
    for (const state of STATES) {
      for (let i = 0; i < perState; i++) {
        await insertTicket({
          teamId,
          createdBy: userId,
          type: TYPES[i % TYPES.length],
          state,
          title: `${state}-${i}`,
        });
      }
    }

    const view = await service.getBoard({ teamId }, ctx.db);
    for (const state of STATES) {
      expect(view.columns[state].count).toBe(perState);
      expect(view.columns[state].tickets).toHaveLength(perState);
    }
    expect(view.total).toBe(perState * STATES.length);
  });

  it("orders each column by modified_at DESC", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const base = Date.UTC(2020, 0, 1);
    await insertTicket({
      teamId,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "oldest",
      modifiedAt: new Date(base),
    });
    await insertTicket({
      teamId,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "newest",
      modifiedAt: new Date(base + 2_000),
    });
    await insertTicket({
      teamId,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "middle",
      modifiedAt: new Date(base + 1_000),
    });

    const view = await service.getBoard({ teamId }, ctx.db);
    expect(view.columns.new.tickets.map((t) => t.title)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("combines type + epicId + q filters with AND", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const epicA = await insertEpicRow(teamId, "Epic A");
    const epicB = await insertEpicRow(teamId, "Epic B");

    // Target: bug + epicA + title containing "login".
    const target = await insertTicket({
      teamId,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "Fix login redirect",
      epicId: epicA,
    });
    // Near-misses on each dimension:
    await insertTicket({
      teamId,
      createdBy: userId,
      type: "feature", // wrong type
      state: "new",
      title: "Fix login button",
      epicId: epicA,
    });
    await insertTicket({
      teamId,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "Fix login modal",
      epicId: epicB, // wrong epic
    });
    await insertTicket({
      teamId,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "Fix signup redirect", // no "login"
      epicId: epicA,
    });

    const view = await service.getBoard(
      { teamId, type: "bug", epicId: epicA, q: "login" },
      ctx.db,
    );
    const ids = STATES.flatMap((s) => view.columns[s].tickets.map((t) => t.id));
    expect(ids).toEqual([target]);
    expect(view.total).toBe(1);
    expect(view.columns.new.tickets[0].epicTitle).toBe("Epic A");
  });

  it("q is a case-insensitive substring over title", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    await insertTicket({
      teamId,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "Investigate DATABASE latency",
    });
    await insertTicket({
      teamId,
      createdBy: userId,
      type: "bug",
      state: "done",
      title: "unrelated ticket",
    });

    for (const q of ["database", "DATABASE", "DaTaBaSe", "base lat"]) {
      const view = await service.getBoard({ teamId, q }, ctx.db);
      expect(view.total).toBe(1);
      expect(view.columns.new.tickets[0].title).toBe(
        "Investigate DATABASE latency",
      );
    }

    // A non-matching substring yields nothing.
    const none = await service.getBoard({ teamId, q: "zzz" }, ctx.db);
    expect(none.total).toBe(0);
  });

  it("only returns tickets for the requested team", async () => {
    const teamA = await insertTeamRow();
    const teamB = await insertTeamRow();
    const userId = await insertUserRow();
    await insertTicket({
      teamId: teamA,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "A ticket",
    });
    await insertTicket({
      teamId: teamB,
      createdBy: userId,
      type: "bug",
      state: "new",
      title: "B ticket",
    });

    const view = await service.getBoard({ teamId: teamA }, ctx.db);
    expect(view.total).toBe(1);
    expect(view.columns.new.tickets[0].title).toBe("A ticket");
  });

  it("400s a missing/invalid teamId and a bad type enum", async () => {
    expect((await expectAppError(service.getBoard({}, ctx.db))).status).toBe(400);
    expect(
      (await expectAppError(service.getBoard({ teamId: "nope" }, ctx.db))).status,
    ).toBe(400);
    const teamId = await insertTeamRow();
    expect(
      (await expectAppError(service.getBoard({ teamId, type: "task" }, ctx.db)))
        .status,
    ).toBe(400);
  });
});
