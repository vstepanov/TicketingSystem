import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { epics, teams, tickets, users } from "@/server/db/schema";
import * as teamRepo from "@/server/repositories/team.repo";
import { setupTestDb, type TestDb } from "../helpers/pg";

process.env.SESSION_SECRET ??= "probe-secret-of-sufficient-length!!!!!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.teardown();
});

describe("team.repo count aggregation (integration)", () => {
  it("countDistinct does not inflate when a team has both tickets and epics", async () => {
    const [u] = await ctx.db
      .insert(users)
      .values({ email: "agg@x.com", passwordHash: "x", emailVerified: true })
      .returning({ id: users.id });
    const [t] = await ctx.db
      .insert(teams)
      .values({ name: "AggTeam" })
      .returning({ id: teams.id });

    // 2 epics + 3 tickets. A naive count() over the double LEFT JOIN would report
    // 6 for each; countDistinct must report the true 2 / 3.
    await ctx.db
      .insert(epics)
      .values([
        { teamId: t.id, title: "e1" },
        { teamId: t.id, title: "e2" },
      ]);
    await ctx.db.insert(tickets).values([
      { teamId: t.id, type: "bug", title: "a", body: "b", createdBy: u.id },
      { teamId: t.id, type: "fix", title: "c", body: "d", createdBy: u.id },
      { teamId: t.id, type: "feature", title: "e", body: "f", createdBy: u.id },
    ]);

    const list = await teamRepo.listTeamsWithCounts(ctx.db);
    const row = list.find((r) => r.id === t.id)!;
    expect(row.ticketCount).toBe(3);
    expect(row.epicCount).toBe(2);
  });

  it("countTeamReferences matches the list aggregation", async () => {
    const [t] = await ctx.db
      .insert(teams)
      .values({ name: "RefTeam" })
      .returning({ id: teams.id });
    await ctx.db.insert(epics).values({ teamId: t.id, title: "solo" });

    const refs = await teamRepo.countTeamReferences(t.id, ctx.db);
    expect(refs).toEqual({ ticketCount: 0, epicCount: 1 });

    // sanity: the team row exists
    const rows = await ctx.db.select().from(teams).where(eq(teams.id, t.id));
    expect(rows).toHaveLength(1);
  });
});
