import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { teams, tickets, users } from "@/server/db/schema";
import type { AppError } from "@/server/http/errors";
import { setupTestDb, type TestDb } from "../helpers/pg";

process.env.SESSION_SECRET ??= "comments-integration-secret-of-sufficient-len";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let service: typeof import("@/server/services/comment.service");

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

async function insertTicketRow(
  teamId: string,
  createdBy: string,
): Promise<{ id: string; modifiedAt: Date }> {
  const [row] = await ctx.db
    .insert(tickets)
    .values({ teamId, type: "bug", title: "T", body: "B", createdBy })
    .returning({ id: tickets.id, modifiedAt: tickets.modifiedAt });
  return row;
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
  service = await import("@/server/services/comment.service");
});

afterAll(async () => {
  await ctx.teardown();
});

describe("comment service (integration, plan §4.7)", () => {
  it("creates a comment: author email joined, body trimmed, timestamped", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow("author@example.com");
    const ticket = await insertTicketRow(teamId, userId);

    const view = await service.createComment(
      ticket.id,
      { body: "  first comment  " },
      userId,
      ctx.db,
    );

    expect(view.author.id).toBe(userId);
    expect(view.author.email).toBe("author@example.com");
    expect(view.body).toBe("first comment");
    expect(view.createdAt).toBeInstanceOf(Date);
    expect(view.id).toBeTruthy();
  });

  it("lists comments OLDEST first (created_at ASC)", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const ticket = await insertTicketRow(teamId, userId);

    // Insert with real time gaps so created_at differs and ordering is provable.
    await service.createComment(ticket.id, { body: "one" }, userId, ctx.db);
    await new Promise((r) => setTimeout(r, 10));
    await service.createComment(ticket.id, { body: "two" }, userId, ctx.db);
    await new Promise((r) => setTimeout(r, 10));
    await service.createComment(ticket.id, { body: "three" }, userId, ctx.db);

    const list = await service.listComments(ticket.id, ctx.db);
    expect(list.map((c) => c.body)).toEqual(["one", "two", "three"]);
    // Timestamps are non-decreasing.
    for (let i = 1; i < list.length; i++) {
      expect(list[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        list[i - 1].createdAt.getTime(),
      );
    }
  });

  it("CRITICAL: posting a comment leaves the ticket's modified_at UNCHANGED", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const ticket = await insertTicketRow(teamId, userId);

    const [beforeRow] = await ctx.db
      .select({ modifiedAt: tickets.modifiedAt })
      .from(tickets)
      .where(eq(tickets.id, ticket.id));

    await new Promise((r) => setTimeout(r, 10));
    await service.createComment(ticket.id, { body: "does not touch ticket" }, userId, ctx.db);

    const [afterRow] = await ctx.db
      .select({ modifiedAt: tickets.modifiedAt })
      .from(tickets)
      .where(eq(tickets.id, ticket.id));

    // Exact equality: the ticket row must not have been written at all.
    expect(afterRow.modifiedAt.getTime()).toBe(beforeRow.modifiedAt.getTime());
  });

  it("returns comments only for the requested ticket", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const ticketA = await insertTicketRow(teamId, userId);
    const ticketB = await insertTicketRow(teamId, userId);

    await service.createComment(ticketA.id, { body: "for A" }, userId, ctx.db);
    await service.createComment(ticketB.id, { body: "for B" }, userId, ctx.db);

    const listA = await service.listComments(ticketA.id, ctx.db);
    expect(listA.map((c) => c.body)).toEqual(["for A"]);
  });

  it("list returns an empty array for a ticket with no comments", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const ticket = await insertTicketRow(teamId, userId);
    const list = await service.listComments(ticket.id, ctx.db);
    expect(list).toEqual([]);
  });

  it("404s list/create for an unknown ticket", async () => {
    const userId = await insertUserRow();
    const missing = "99999999-9999-9999-9999-999999999999";
    expect((await expectAppError(service.listComments(missing, ctx.db))).status).toBe(404);
    expect(
      (await expectAppError(
        service.createComment(missing, { body: "hi" }, userId, ctx.db),
      )).status,
    ).toBe(404);
  });

  it("rejects an empty body at the real service boundary → 400 (no row written)", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const ticket = await insertTicketRow(teamId, userId);
    const err = await expectAppError(
      service.createComment(ticket.id, { body: "   " }, userId, ctx.db),
    );
    expect(err.status).toBe(400);
    const list = await service.listComments(ticket.id, ctx.db);
    expect(list).toEqual([]);
  });
});
