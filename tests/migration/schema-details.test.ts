/**
 * Supplementary migration / schema-detail tests (plan §3, S20 gap-fill).
 *
 * schema.test.ts already proves: all tables + __drizzle_migrations exist, both
 * enums have their exact values, citext unique on email/team name, the composite
 * epic↔team FK, RESTRICT/CASCADE delete actions, non-empty CHECKs, the board +
 * trigram indexes, epic_id nullability, zero application rows, and idempotency.
 *
 * This file fills the remaining gaps called out for S20 so the DB contract is
 * fully pinned:
 *   - every remaining documented index (§3.5) is present,
 *   - the `state` column defaults to 'new' (§3.2),
 *   - uuid PKs default to gen_random_uuid() (§3.1),
 *   - all timestamp columns are `timestamptz` and default now() (§3.1),
 *   - required columns are NOT NULL (§3.2), and epic.description is nullable,
 *   - a functional smoke: the composite FK actually rejects a cross-team epic.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestDb, type TestDb } from "../helpers/pg";

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
}, 120_000);

afterAll(async () => {
  await ctx?.teardown();
});

describe("all documented indexes exist (§3.5)", () => {
  it("creates the supporting FK / listing / ordering indexes", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const names = new Set(rows.map((r) => r.indexname));

    for (const idx of [
      "epics_team_id_idx",
      "tickets_team_id_idx",
      "tickets_epic_id_idx",
      "tickets_team_state_modified_idx",
      "tickets_title_trgm_idx",
      "comments_ticket_id_created_at_idx",
      "verification_tokens_user_id_idx",
    ]) {
      expect(names, `${idx} should exist`).toContain(idx);
    }
  });

  it("has UNIQUE targets for the composite FK on epics(id, team_id)", async () => {
    const rows = await ctx.sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'u'
    `;
    const names = rows.map((r) => r.conname);
    expect(names).toContain("epics_id_team_id_key");
  });

  it("has a UNIQUE constraint on the verification token hash", async () => {
    const rows = await ctx.sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'u'
    `;
    expect(rows.map((r) => r.conname)).toContain(
      "verification_tokens_token_hash_unique",
    );
  });
});

describe("column defaults and types (§3.1, §3.2)", () => {
  it("tickets.state defaults to 'new'", async () => {
    const rows = await ctx.sql<{ column_default: string | null }[]>`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = 'tickets' AND column_name = 'state'
    `;
    expect(rows[0].column_default ?? "").toMatch(/'new'/);
  });

  it("uuid primary keys default to gen_random_uuid()", async () => {
    const rows = await ctx.sql<
      { table_name: string; column_default: string | null }[]
    >`
      SELECT table_name, column_default
      FROM information_schema.columns
      WHERE column_name = 'id' AND table_schema = 'public'
        AND table_name IN
          ('users','verification_tokens','teams','epics','tickets','comments')
    `;
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.column_default ?? "", `${r.table_name}.id default`).toMatch(
        /gen_random_uuid\(\)/,
      );
    }
  });

  it("every timestamp column is timestamptz", async () => {
    const rows = await ctx.sql<
      { table_name: string; column_name: string; data_type: string }[]
    >`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN
          ('created_at','modified_at','expires_at','consumed_at')
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(
        r.data_type,
        `${r.table_name}.${r.column_name} should be timestamptz`,
      ).toBe("timestamp with time zone");
    }
  });

  it("created_at / modified_at default to now()", async () => {
    const rows = await ctx.sql<{ column_default: string | null }[]>`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = 'tickets'
        AND column_name IN ('created_at', 'modified_at')
    `;
    for (const r of rows) {
      expect(r.column_default ?? "").toMatch(/now\(\)/);
    }
  });

  it("required columns are NOT NULL and epic.description is nullable", async () => {
    const rows = await ctx.sql<
      { table_name: string; column_name: string; is_nullable: string }[]
    >`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'users' AND column_name IN ('email','password_hash','email_verified'))
          OR (table_name = 'tickets' AND column_name IN ('team_id','type','state','title','body','created_by'))
          OR (table_name = 'epics' AND column_name IN ('team_id','title','description'))
        )
    `;
    const byKey = new Map(
      rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable]),
    );
    for (const key of [
      "users.email",
      "users.password_hash",
      "users.email_verified",
      "tickets.team_id",
      "tickets.type",
      "tickets.state",
      "tickets.title",
      "tickets.body",
      "tickets.created_by",
      "epics.team_id",
      "epics.title",
    ]) {
      expect(byKey.get(key), `${key} should be NOT NULL`).toBe("NO");
    }
    // description is the one documented nullable text column on epics.
    expect(byKey.get("epics.description")).toBe("YES");
  });
});

describe("composite FK is enforced by the database (§3.2)", () => {
  it("rejects a ticket whose epic belongs to a different team", async () => {
    // Two teams, an epic under team A, then a ticket in team B pointing at it.
    const [teamA] = await ctx.sql<{ id: string }[]>`
      INSERT INTO teams (name) VALUES ('team-a') RETURNING id
    `;
    const [teamB] = await ctx.sql<{ id: string }[]>`
      INSERT INTO teams (name) VALUES ('team-b') RETURNING id
    `;
    const [epicA] = await ctx.sql<{ id: string }[]>`
      INSERT INTO epics (team_id, title) VALUES (${teamA.id}, 'epic-a')
      RETURNING id
    `;
    const [user] = await ctx.sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES ('u@example.com', 'x')
      RETURNING id
    `;

    await expect(
      ctx.sql`
        INSERT INTO tickets (team_id, epic_id, type, title, body, created_by)
        VALUES (${teamB.id}, ${epicA.id}, 'bug', 't', 'b', ${user.id})
      `,
    ).rejects.toThrow();

    // Clean up so the "fresh DB" invariant asserted elsewhere is unaffected
    // within this isolated cluster (each test file gets its own DB anyway).
    await ctx.sql`DELETE FROM epics WHERE id = ${epicA.id}`;
    await ctx.sql`DELETE FROM users WHERE id = ${user.id}`;
    await ctx.sql`DELETE FROM teams WHERE id IN (${teamA.id}, ${teamB.id})`;
  });
});
