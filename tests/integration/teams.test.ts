import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { epics, teams, tickets, users } from "@/server/db/schema";
import { toAppError, type AppError } from "@/server/http/errors";
import * as teamRepo from "@/server/repositories/team.repo";
import { setupTestDb, type TestDb } from "../helpers/pg";

function eqId(id: string) {
  return eq(teams.id, id);
}

process.env.SESSION_SECRET ??= "teams-integration-secret-of-sufficient-length";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let service: typeof import("@/server/services/team.service");

function newName(prefix = "Team"): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
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

async function insertTicketFor(teamId: string, createdBy: string): Promise<void> {
  await ctx.db.insert(tickets).values({
    teamId,
    type: "bug",
    title: "A ticket",
    body: "Body",
    createdBy,
  });
}

async function insertEpicFor(teamId: string): Promise<void> {
  await ctx.db.insert(epics).values({ teamId, title: "An epic" });
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
  service = await import("@/server/services/team.service");
});

afterAll(async () => {
  await ctx.teardown();
});

describe("team service (integration, plan §4.4)", () => {
  it("creates a team, trimming the name", async () => {
    const name = newName();
    const view = await service.createTeam({ name: `  ${name}  ` }, ctx.db);
    expect(view.name).toBe(name);
    expect(view.ticketCount).toBe(0);
    expect(view.epicCount).toBe(0);
    expect(view.canDelete).toBe(true);
    expect(view.createdAt).toBeInstanceOf(Date);
  });

  it("'Payments' and 'payments' collide (case-insensitive) → 409", async () => {
    await service.createTeam({ name: "Payments" }, ctx.db);
    const err = await expectAppError(
      service.createTeam({ name: "payments" }, ctx.db),
    );
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
  });

  it("lists teams sorted by name with correct counts + canDelete", async () => {
    const fresh = await setupTestDb();
    try {
      const svc = await import("@/server/services/team.service");
      const userId = (
        await fresh.db
          .insert(users)
          .values({
            email: `u${Math.random().toString(36).slice(2)}@example.com`,
            passwordHash: "x",
            emailVerified: true,
          })
          .returning({ id: users.id })
      )[0].id;

      const [beta] = await fresh.db
        .insert(teams)
        .values({ name: "Beta" })
        .returning({ id: teams.id });
      await fresh.db.insert(teams).values({ name: "Alpha" });

      // Give Beta a ticket so it is not deletable.
      await fresh.db.insert(tickets).values({
        teamId: beta.id,
        type: "feature",
        title: "t",
        body: "b",
        createdBy: userId,
      });

      const list = await svc.listTeams(fresh.db);
      expect(list.map((t) => t.name)).toEqual(["Alpha", "Beta"]);

      const alpha = list.find((t) => t.name === "Alpha")!;
      const betaView = list.find((t) => t.name === "Beta")!;
      expect(alpha.ticketCount).toBe(0);
      expect(alpha.canDelete).toBe(true);
      expect(betaView.ticketCount).toBe(1);
      expect(betaView.canDelete).toBe(false);
    } finally {
      await fresh.teardown();
    }
  });

  it("no-op rename (case change) keeps modified_at", async () => {
    const created = await service.createTeam({ name: newName("NoOp") }, ctx.db);
    const before = created.modifiedAt;

    const renamed = await service.renameTeam(
      created.id,
      { name: created.name.toUpperCase() },
      ctx.db,
    );
    expect(renamed.modifiedAt.getTime()).toBe(before.getTime());
    expect(renamed.name).toBe(created.name);
  });

  it("real rename advances modified_at", async () => {
    const created = await service.createTeam({ name: newName("Rename") }, ctx.db);
    const before = created.modifiedAt;
    // Ensure the clock advances past the create timestamp.
    await new Promise((r) => setTimeout(r, 5));

    const target = newName("Renamed");
    const renamed = await service.renameTeam(
      created.id,
      { name: target },
      ctx.db,
    );
    expect(renamed.name).toBe(target);
    expect(renamed.modifiedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("rename collision with another team → 409", async () => {
    const a = await service.createTeam({ name: newName("A") }, ctx.db);
    const b = await service.createTeam({ name: newName("B") }, ctx.db);
    const err = await expectAppError(
      service.renameTeam(b.id, { name: a.name }, ctx.db),
    );
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
  });

  it("404 renaming/deleting an unknown team", async () => {
    const missing = "99999999-9999-9999-9999-999999999999";
    const renameErr = await expectAppError(
      service.renameTeam(missing, { name: newName() }, ctx.db),
    );
    expect(renameErr.status).toBe(404);
    const deleteErr = await expectAppError(service.deleteTeam(missing, ctx.db));
    expect(deleteErr.status).toBe(404);
  });

  it("deletes an empty team (→ 204 path returns void)", async () => {
    const created = await service.createTeam({ name: newName("Empty") }, ctx.db);
    await expect(service.deleteTeam(created.id, ctx.db)).resolves.toBeUndefined();
    const stillThere = await ctx.db
      .select()
      .from(teams)
      .where(eqId(created.id));
    expect(stillThere).toHaveLength(0);
  });

  it("delete with a ticket → 409 (FK RESTRICT, real error shape)", async () => {
    const userId = await insertUserRow();
    const created = await service.createTeam({ name: newName("HasTicket") }, ctx.db);
    await insertTicketFor(created.id, userId);

    const err = await expectAppError(service.deleteTeam(created.id, ctx.db));
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
    // The team must still exist (delete was blocked).
    const stillThere = await ctx.db
      .select()
      .from(teams)
      .where(eqId(created.id));
    expect(stillThere).toHaveLength(1);
  });

  it("delete with an epic → 409 (FK RESTRICT, real error shape)", async () => {
    const created = await service.createTeam({ name: newName("HasEpic") }, ctx.db);
    await insertEpicFor(created.id);

    const err = await expectAppError(service.deleteTeam(created.id, ctx.db));
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
  });

  it("toAppError maps the REAL FK RESTRICT delete error to 409 (bypassing the service pre-check)", async () => {
    // This exercises the actual thrown driver error shape: we delete a non-empty
    // team directly via the repo (no count pre-check), so Postgres raises 23503.
    // The mapper must recognise it as 409 even if the SQLSTATE is on `.cause`.
    const userId = await insertUserRow();
    const created = await service.createTeam(
      { name: newName("RawDelete") },
      ctx.db,
    );
    await insertTicketFor(created.id, userId);

    let thrown: unknown;
    try {
      await teamRepo.deleteTeam(created.id, ctx.db);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    const mapped = toAppError(thrown);
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
  });
});
