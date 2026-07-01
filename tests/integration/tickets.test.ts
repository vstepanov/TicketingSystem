import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comments, epics, teams, tickets, users } from "@/server/db/schema";
import { toAppError, type AppError } from "@/server/http/errors";
import * as ticketRepo from "@/server/repositories/ticket.repo";
import { setupTestDb, type TestDb } from "../helpers/pg";

process.env.SESSION_SECRET ??= "tickets-integration-secret-of-sufficient-len!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let service: typeof import("@/server/services/ticket.service");

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

async function insertUserRow(email = `u${rand()}@example.com`): Promise<string> {
  const [row] = await ctx.db
    .insert(users)
    .values({ email, passwordHash: "x", emailVerified: true })
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
  service = await import("@/server/services/ticket.service");
});

afterAll(async () => {
  await ctx.teardown();
});

describe("ticket service (integration, plan §4.6)", () => {
  it("creates a ticket with defaults (state 'new'), trimming title/body", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const view = await service.createTicket(
      { teamId, type: "feature", title: "  Add search  ", body: "  desc  " },
      userId,
      ctx.db,
    );
    expect(view.teamId).toBe(teamId);
    expect(view.type).toBe("feature");
    expect(view.state).toBe("new");
    expect(view.title).toBe("Add search");
    expect(view.body).toBe("desc");
    expect(view.epicId).toBeNull();
    expect(view.createdBy).toBe(userId);
    expect(view.createdAt).toBeInstanceOf(Date);
  });

  it("404s create when the team does not exist", async () => {
    const userId = await insertUserRow();
    const missing = "99999999-9999-9999-9999-999999999999";
    const err = await expectAppError(
      service.createTicket(
        { teamId: missing, type: "bug", title: "T", body: "B" },
        userId,
        ctx.db,
      ),
    );
    expect(err.status).toBe(404);
  });

  it("creates a ticket referencing a same-team epic", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const epicId = await insertEpicRow(teamId);
    const view = await service.createTicket(
      { teamId, type: "bug", title: "T", body: "B", epicId },
      userId,
      ctx.db,
    );
    expect(view.epicId).toBe(epicId);
  });

  it("rejects a cross-team epic on create → 400 (real DB path, no row written)", async () => {
    const teamA = await insertTeamRow();
    const teamB = await insertTeamRow();
    const userId = await insertUserRow();
    const epicOfB = await insertEpicRow(teamB);

    const err = await expectAppError(
      service.createTicket(
        { teamId: teamA, type: "bug", title: "T", body: "B", epicId: epicOfB },
        userId,
        ctx.db,
      ),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);

    const rows = await ctx.db
      .select()
      .from(tickets)
      .where(eq(tickets.teamId, teamA));
    expect(rows).toHaveLength(0);
  });

  it("the DB composite FK is the backstop: a cross-team epic insert maps to 400", async () => {
    // Bypass the service pre-check and hit the repo directly so Postgres raises
    // the composite-FK violation. mapWriteError semantics are exercised via the
    // service in the test above; here we assert the raw driver error is a
    // conflict SQLSTATE that toAppError recognises (which the service remaps to
    // 400).
    const teamA = await insertTeamRow();
    const teamB = await insertTeamRow();
    const userId = await insertUserRow();
    const epicOfB = await insertEpicRow(teamB);

    let thrown: unknown;
    try {
      await ticketRepo.insertTicket(
        {
          teamId: teamA,
          epicId: epicOfB,
          type: "bug",
          state: "new",
          title: "T",
          body: "B",
          createdBy: userId,
        },
        ctx.db,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    // Raw driver error is a FK violation → toAppError => CONFLICT; the service
    // wrapper turns this into a 400 (see mapWriteError).
    expect(toAppError(thrown).code).toBe("CONFLICT");
  });

  it("GET returns full ticket + author email + epic title", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow("author@example.com");
    const epicId = await insertEpicRow(teamId, "Payments epic");
    const created = await service.createTicket(
      { teamId, type: "fix", title: "T", body: "B", epicId },
      userId,
      ctx.db,
    );

    const detail = await service.getTicket(created.id, ctx.db);
    expect(detail.authorEmail).toBe("author@example.com");
    expect(detail.epicTitle).toBe("Payments epic");
    expect(detail.createdBy).toBe(userId);

    // A ticket with no epic returns epicTitle null.
    const noEpic = await service.createTicket(
      { teamId, type: "bug", title: "T2", body: "B2" },
      userId,
      ctx.db,
    );
    const noEpicDetail = await service.getTicket(noEpic.id, ctx.db);
    expect(noEpicDetail.epicTitle).toBeNull();
  });

  it("404s GET/PATCH/DELETE for an unknown ticket", async () => {
    const missing = "99999999-9999-9999-9999-999999999999";
    expect((await expectAppError(service.getTicket(missing, ctx.db))).status).toBe(404);
    expect(
      (await expectAppError(service.updateTicket(missing, { title: "X" }, ctx.db)))
        .status,
    ).toBe(404);
    expect((await expectAppError(service.deleteTicket(missing, ctx.db))).status).toBe(404);
  });

  it("no-op PATCH keeps modified_at; real PATCH advances it", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const created = await service.createTicket(
      { teamId, type: "bug", title: "T", body: "B" },
      userId,
      ctx.db,
    );
    const before = created.modifiedAt;

    const noop = await service.updateTicket(
      created.id,
      { title: "T", body: "B", type: "bug", state: "new" },
      ctx.db,
    );
    expect(noop.modifiedAt.getTime()).toBe(before.getTime());

    await new Promise((r) => setTimeout(r, 5));
    const changed = await service.updateTicket(
      created.id,
      { state: "in_progress" },
      ctx.db,
    );
    expect(changed.state).toBe("in_progress");
    expect(changed.modifiedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("rejects a cross-team epic on PATCH → 400", async () => {
    const teamA = await insertTeamRow();
    const teamB = await insertTeamRow();
    const userId = await insertUserRow();
    const epicOfB = await insertEpicRow(teamB);
    const created = await service.createTicket(
      { teamId: teamA, type: "bug", title: "T", body: "B" },
      userId,
      ctx.db,
    );

    const err = await expectAppError(
      service.updateTicket(created.id, { epicId: epicOfB }, ctx.db),
    );
    expect(err.status).toBe(400);

    // Ticket's epic is unchanged (still null).
    const [row] = await ctx.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, created.id));
    expect(row.epicId).toBeNull();
  });

  it("team change requires epic null-or-same-team: rejects stale epic, allows clearing it", async () => {
    const teamA = await insertTeamRow();
    const teamB = await insertTeamRow();
    const userId = await insertUserRow();
    const epicOfA = await insertEpicRow(teamA);
    const created = await service.createTicket(
      { teamId: teamA, type: "bug", title: "T", body: "B", epicId: epicOfA },
      userId,
      ctx.db,
    );

    // Moving team while keeping the old epic → 400.
    const err = await expectAppError(
      service.updateTicket(created.id, { teamId: teamB }, ctx.db),
    );
    expect(err.status).toBe(400);

    // Moving team AND clearing the epic → OK.
    const moved = await service.updateTicket(
      created.id,
      { teamId: teamB, epicId: null },
      ctx.db,
    );
    expect(moved.teamId).toBe(teamB);
    expect(moved.epicId).toBeNull();
  });

  it("state endpoint persists the new state and advances modified_at (drop provable server-side)", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const created = await service.createTicket(
      { teamId, type: "bug", title: "T", body: "B" },
      userId,
      ctx.db,
    );
    expect(created.state).toBe("new");
    const before = created.modifiedAt;

    await new Promise((r) => setTimeout(r, 5));
    // Any state → any state: jump straight to "done" (not a sequential step).
    const result = await service.updateTicketState(
      created.id,
      { state: "done" },
      ctx.db,
    );
    expect(result).toEqual({
      id: created.id,
      state: "done",
      modifiedAt: expect.any(Date),
    });
    expect(result.modifiedAt.getTime()).toBeGreaterThan(before.getTime());

    // Re-read the row directly: the state is persisted, modified_at advanced.
    const [row] = await ctx.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, created.id));
    expect(row.state).toBe("done");
    expect(row.modifiedAt.getTime()).toBe(result.modifiedAt.getTime());
    expect(row.modifiedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("state endpoint is a no-op when the state is unchanged (modified_at stays)", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const created = await service.createTicket(
      { teamId, type: "bug", title: "T", body: "B" },
      userId,
      ctx.db,
    );
    const before = created.modifiedAt;

    await new Promise((r) => setTimeout(r, 5));
    const result = await service.updateTicketState(
      created.id,
      { state: "new" },
      ctx.db,
    );
    expect(result.state).toBe("new");
    expect(result.modifiedAt.getTime()).toBe(before.getTime());

    const [row] = await ctx.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, created.id));
    expect(row.modifiedAt.getTime()).toBe(before.getTime());
  });

  it("state endpoint rejects an invalid state → 400 (no row change)", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const created = await service.createTicket(
      { teamId, type: "bug", title: "T", body: "B" },
      userId,
      ctx.db,
    );
    const err = await expectAppError(
      service.updateTicketState(created.id, { state: "wip" }, ctx.db),
    );
    expect(err.status).toBe(400);

    const [row] = await ctx.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, created.id));
    expect(row.state).toBe("new");
  });

  it("state endpoint 404s an unknown ticket", async () => {
    const missing = "99999999-9999-9999-9999-999999999999";
    const err = await expectAppError(
      service.updateTicketState(missing, { state: "done" }, ctx.db),
    );
    expect(err.status).toBe(404);
  });

  it("DELETE removes the ticket and cascades its comments", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const created = await service.createTicket(
      { teamId, type: "bug", title: "T", body: "B" },
      userId,
      ctx.db,
    );
    await ctx.db
      .insert(comments)
      .values({ ticketId: created.id, authorId: userId, body: "a comment" });
    await ctx.db
      .insert(comments)
      .values({ ticketId: created.id, authorId: userId, body: "another" });

    const before = await ctx.db
      .select()
      .from(comments)
      .where(eq(comments.ticketId, created.id));
    expect(before).toHaveLength(2);

    await service.deleteTicket(created.id, ctx.db);

    const ticketRows = await ctx.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, created.id));
    expect(ticketRows).toHaveLength(0);
    const after = await ctx.db
      .select()
      .from(comments)
      .where(eq(comments.ticketId, created.id));
    expect(after).toHaveLength(0);
  });
});
