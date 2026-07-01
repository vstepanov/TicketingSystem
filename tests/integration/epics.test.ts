import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { epics, teams, tickets, users } from "@/server/db/schema";
import { toAppError, type AppError } from "@/server/http/errors";
import * as epicRepo from "@/server/repositories/epic.repo";
import { setupTestDb, type TestDb } from "../helpers/pg";

process.env.SESSION_SECRET ??= "epics-integration-secret-of-sufficient-length";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let service: typeof import("@/server/services/epic.service");

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
    .values({
      email: `u${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: "x",
      emailVerified: true,
    })
    .returning({ id: users.id });
  return row.id;
}

async function insertTicketForEpic(
  teamId: string,
  epicId: string,
  createdBy: string,
): Promise<void> {
  await ctx.db.insert(tickets).values({
    teamId,
    epicId,
    type: "bug",
    title: "A ticket",
    body: "Body",
    createdBy,
  });
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
  service = await import("@/server/services/epic.service");
});

afterAll(async () => {
  await ctx.teardown();
});

describe("epic service (integration, plan §4.5)", () => {
  it("creates an epic under a team, trimming the title", async () => {
    const teamId = await insertTeamRow();
    const view = await service.createEpic(
      { teamId, title: "  Login flow  ", description: "  details  " },
      ctx.db,
    );
    expect(view.teamId).toBe(teamId);
    expect(view.title).toBe("Login flow");
    expect(view.description).toBe("details");
    expect(view.ticketCount).toBe(0);
    expect(view.canDelete).toBe(true);
    expect(view.createdAt).toBeInstanceOf(Date);
  });

  it("404s create when the team does not exist", async () => {
    const missing = "99999999-9999-9999-9999-999999999999";
    const err = await expectAppError(
      service.createEpic({ teamId: missing, title: "T" }, ctx.db),
    );
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
  });

  it("lists a team's epics sorted by title with ticketCount + canDelete", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();

    const beta = await service.createEpic(
      { teamId, title: "Beta" },
      ctx.db,
    );
    await service.createEpic({ teamId, title: "Alpha" }, ctx.db);
    await insertTicketForEpic(teamId, beta.id, userId);

    const list = await service.listEpics(teamId, ctx.db);
    expect(list.map((e) => e.title)).toEqual(["Alpha", "Beta"]);

    const alpha = list.find((e) => e.title === "Alpha")!;
    const betaView = list.find((e) => e.title === "Beta")!;
    expect(alpha.ticketCount).toBe(0);
    expect(alpha.canDelete).toBe(true);
    expect(betaView.ticketCount).toBe(1);
    expect(betaView.canDelete).toBe(false);
  });

  it("list only returns epics of the requested team", async () => {
    const teamA = await insertTeamRow();
    const teamB = await insertTeamRow();
    await service.createEpic({ teamId: teamA, title: rand("A") }, ctx.db);
    await service.createEpic({ teamId: teamB, title: rand("B") }, ctx.db);

    const listA = await service.listEpics(teamA, ctx.db);
    expect(listA.every((e) => e.teamId === teamA)).toBe(true);
    expect(listA).toHaveLength(1);
  });

  it("PATCH rejects a teamId in the body (team immutable) → 400, team unchanged", async () => {
    const teamId = await insertTeamRow();
    const otherTeam = await insertTeamRow();
    const epic = await service.createEpic(
      { teamId, title: rand("Immut") },
      ctx.db,
    );

    const err = await expectAppError(
      service.updateEpic(epic.id, { teamId: otherTeam, title: "New" }, ctx.db),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);

    // The stored epic still belongs to the original team.
    const [row] = await ctx.db
      .select()
      .from(epics)
      .where(eq(epics.id, epic.id));
    expect(row.teamId).toBe(teamId);
    expect(row.title).not.toBe("New");
  });

  it("no-op edit keeps modified_at; real edit advances it", async () => {
    const teamId = await insertTeamRow();
    const epic = await service.createEpic(
      { teamId, title: rand("NoOp"), description: "d" },
      ctx.db,
    );
    const before = epic.modifiedAt;

    // No-op: same title (and description omitted → unchanged).
    const noop = await service.updateEpic(
      epic.id,
      { title: epic.title },
      ctx.db,
    );
    expect(noop.modifiedAt.getTime()).toBe(before.getTime());

    // Real change.
    await new Promise((r) => setTimeout(r, 5));
    const changed = await service.updateEpic(
      epic.id,
      { title: rand("Renamed") },
      ctx.db,
    );
    expect(changed.modifiedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("404s updating/deleting an unknown epic", async () => {
    const missing = "99999999-9999-9999-9999-999999999999";
    const updateErr = await expectAppError(
      service.updateEpic(missing, { title: "X" }, ctx.db),
    );
    expect(updateErr.status).toBe(404);
    const deleteErr = await expectAppError(service.deleteEpic(missing, ctx.db));
    expect(deleteErr.status).toBe(404);
  });

  it("deletes an unreferenced epic (→ 204 path returns void)", async () => {
    const teamId = await insertTeamRow();
    const epic = await service.createEpic(
      { teamId, title: rand("Empty") },
      ctx.db,
    );
    await expect(service.deleteEpic(epic.id, ctx.db)).resolves.toBeUndefined();
    const stillThere = await ctx.db
      .select()
      .from(epics)
      .where(eq(epics.id, epic.id));
    expect(stillThere).toHaveLength(0);
  });

  it("delete a referenced epic → 409 (FK RESTRICT, real error shape)", async () => {
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const epic = await service.createEpic(
      { teamId, title: rand("HasTicket") },
      ctx.db,
    );
    await insertTicketForEpic(teamId, epic.id, userId);

    const err = await expectAppError(service.deleteEpic(epic.id, ctx.db));
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
    // The epic must still exist (delete was blocked).
    const stillThere = await ctx.db
      .select()
      .from(epics)
      .where(eq(epics.id, epic.id));
    expect(stillThere).toHaveLength(1);
  });

  it("toAppError maps the REAL FK RESTRICT delete error to 409 (bypassing the pre-check)", async () => {
    // Delete a referenced epic directly via the repo (no count pre-check), so
    // Postgres raises the restrict violation. The mapper must recognise it as
    // 409 even if the SQLSTATE is nested on `.cause`.
    const teamId = await insertTeamRow();
    const userId = await insertUserRow();
    const epic = await service.createEpic(
      { teamId, title: rand("RawDelete") },
      ctx.db,
    );
    await insertTicketForEpic(teamId, epic.id, userId);

    let thrown: unknown;
    try {
      await epicRepo.deleteEpic(epic.id, ctx.db);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    const mapped = toAppError(thrown);
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
  });
});
