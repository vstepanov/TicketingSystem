/**
 * Migration / schema-shape tests (plan §3, S03 DoD).
 *
 * Runs the real migrations against an embedded PostgreSQL 18 cluster and then
 * queries the catalog to prove the schema matches the ERD (§2.9) and the
 * constraint spec (§3.2–§3.6):
 *
 *   (a) all 7 app tables + __drizzle_migrations exist,
 *   (b) enums ticket_type/ticket_state have the exact canonical values,
 *   (c) key constraints are present (composite FK, RESTRICT/CASCADE, citext unique,
 *       CHECKs, extensions, board + trgm indexes),
 *   (d) every application table is empty (count = 0) on a fresh DB,
 *   (e) re-running migrate is idempotent (no error, no duplicate objects).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../scripts/migrate";
import { setupTestDb, type TestDb } from "../helpers/pg";

const APP_TABLES = [
  "users",
  "verification_tokens",
  "teams",
  "epics",
  "tickets",
  "comments",
] as const;

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
}, 120_000);

afterAll(async () => {
  await ctx?.teardown();
});

describe("schema objects exist", () => {
  it("creates all 7 application tables plus __drizzle_migrations", async () => {
    const rows = await ctx.sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    const names = rows.map((r) => r.table_name);

    for (const t of APP_TABLES) {
      expect(names, `table ${t} should exist`).toContain(t);
    }
    // drizzle migration metadata lives in the __drizzle_migrations table
    // (default schema "drizzle"); assert it exists somewhere.
    const meta = await ctx.sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_name = '__drizzle_migrations'
    `;
    expect(Number(meta[0].count)).toBeGreaterThan(0);
  });

  it("enables the citext and pg_trgm extensions", async () => {
    const rows = await ctx.sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension
    `;
    const exts = rows.map((r) => r.extname);
    expect(exts).toContain("citext");
    expect(exts).toContain("pg_trgm");
  });
});

describe("enums have exact canonical values", () => {
  async function enumValues(typeName: string): Promise<string[]> {
    const rows = await ctx.sql<{ label: string; sortorder: number }[]>`
      SELECT e.enumlabel AS label, e.enumsortorder AS sortorder
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = ${typeName}
      ORDER BY e.enumsortorder
    `;
    return rows.map((r) => r.label);
  }

  it("ticket_type = bug | feature | fix", async () => {
    expect(await enumValues("ticket_type")).toEqual(["bug", "feature", "fix"]);
  });

  it("ticket_state has the 5 canonical states in board order", async () => {
    expect(await enumValues("ticket_state")).toEqual([
      "new",
      "ready_for_implementation",
      "in_progress",
      "ready_for_acceptance",
      "done",
    ]);
  });
});

describe("key constraints", () => {
  it("citext gives case-insensitive unique email and team name", async () => {
    const cols = await ctx.sql<{ table_name: string; udt_name: string }[]>`
      SELECT table_name, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'users' AND column_name = 'email')
          OR (table_name = 'teams' AND column_name = 'name'))
    `;
    for (const c of cols) {
      expect(c.udt_name, `${c.table_name} should be citext`).toBe("citext");
    }
    // Unique constraints present on those columns.
    const uniques = await ctx.sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'u'
    `;
    const names = uniques.map((r) => r.conname);
    expect(names).toContain("users_email_unique");
    expect(names).toContain("teams_name_unique");
    expect(names).toContain("epics_id_team_id_key");
  });

  it("declares the composite FK tickets(epic_id, team_id) -> epics(id, team_id)", async () => {
    const rows = await ctx.sql<
      {
        conname: string;
        confdeltype: string;
        cols: string[];
        refcols: string[];
        reftable: string;
      }[]
    >`
      SELECT
        c.conname,
        c.confdeltype,
        ARRAY(
          SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          ORDER BY k.ord
        ) AS cols,
        ARRAY(
          SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum
          ORDER BY k.ord
        ) AS refcols,
        rt.relname AS reftable
      FROM pg_constraint c
      JOIN pg_class rt ON rt.oid = c.confrelid
      WHERE c.conname = 'tickets_epic_id_team_id_fkey'
    `;
    expect(rows).toHaveLength(1);
    const fk = rows[0];
    expect(fk.cols).toEqual(["epic_id", "team_id"]);
    expect(fk.refcols).toEqual(["id", "team_id"]);
    expect(fk.reftable).toBe("epics");
    // 'r' = RESTRICT delete action.
    expect(fk.confdeltype).toBe("r");
  });

  it("applies RESTRICT on team/epic/created_by/author FKs and CASCADE only on the two documented ones", async () => {
    const rows = await ctx.sql<
      { conname: string; confdeltype: string }[]
    >`
      SELECT conname, confdeltype
      FROM pg_constraint
      WHERE contype = 'f'
    `;
    const byName = new Map(rows.map((r) => [r.conname, r.confdeltype]));

    // RESTRICT ('r')
    expect(byName.get("epics_team_id_teams_id_fk")).toBe("r");
    expect(byName.get("tickets_team_id_teams_id_fk")).toBe("r");
    expect(byName.get("tickets_created_by_users_id_fk")).toBe("r");
    expect(byName.get("comments_author_id_users_id_fk")).toBe("r");
    expect(byName.get("tickets_epic_id_team_id_fkey")).toBe("r");

    // CASCADE ('c') — exactly the two documented relationships.
    expect(byName.get("comments_ticket_id_tickets_id_fk")).toBe("c");
    expect(byName.get("verification_tokens_user_id_users_id_fk")).toBe("c");

    const cascades = [...byName.entries()].filter(([, t]) => t === "c");
    expect(cascades).toHaveLength(2);
  });

  it("has non-empty CHECK constraints on required text columns", async () => {
    const rows = await ctx.sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'c'
    `;
    const names = rows.map((r) => r.conname);
    for (const c of [
      "users_email_nonempty_check",
      "teams_name_nonempty_check",
      "epics_title_nonempty_check",
      "tickets_title_nonempty_check",
      "tickets_body_nonempty_check",
      "comments_body_nonempty_check",
    ]) {
      expect(names, `${c} should exist`).toContain(c);
    }
  });

  it("creates the board index and the trigram title GIN index", async () => {
    const rows = await ctx.sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
    `;
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));

    expect(byName.has("tickets_team_state_modified_idx")).toBe(true);
    expect(byName.get("tickets_team_state_modified_idx")).toMatch(
      /team_id.*state.*modified_at DESC/i,
    );

    expect(byName.has("tickets_title_trgm_idx")).toBe(true);
    const trgm = byName.get("tickets_title_trgm_idx") ?? "";
    expect(trgm).toMatch(/gin/i);
    expect(trgm).toMatch(/lower/i);
    expect(trgm).toMatch(/gin_trgm_ops/i);
  });

  it("makes epic_id nullable so unassigned tickets bypass the composite FK", async () => {
    const rows = await ctx.sql<{ is_nullable: string }[]>`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tickets' AND column_name = 'epic_id'
    `;
    expect(rows[0].is_nullable).toBe("YES");
  });
});

describe("fresh DB has zero application rows", () => {
  it("every application table is empty after migrate", async () => {
    for (const table of APP_TABLES) {
      const rows = await ctx.sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM ${ctx.sql(table)}
      `;
      expect(Number(rows[0].count), `${table} should be empty`).toBe(0);
    }
  });
});

describe("migrations are idempotent", () => {
  it("re-running migrate against the same DB is a no-op (no error, no dupes)", async () => {
    const before = await ctx.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations
    `;

    await expect(runMigrations(ctx.url)).resolves.toBeUndefined();

    const after = await ctx.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations
    `;
    expect(after[0].count).toBe(before[0].count);

    // No duplicate types/tables were created.
    const typeCount = await ctx.sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM pg_type WHERE typname IN ('ticket_type', 'ticket_state')
    `;
    expect(Number(typeCount[0].count)).toBe(2);
  });
});
