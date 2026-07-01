/**
 * Drizzle ORM schema for the Kanban Ticketing System.
 *
 * This is the single TypeScript source of truth for the persistence tier. It
 * mirrors plan §3 (PostgreSQL 18) exactly:
 *
 *   - native PG enums `ticket_type` / `ticket_state` (§3.4)
 *   - `citext` for case-insensitive unique `users.email` / `teams.name` (§3.1)
 *   - `ON DELETE RESTRICT` everywhere except the two documented CASCADEs (§3.3)
 *   - composite FK `tickets(epic_id, team_id) -> epics(id, team_id)` (§3.2)
 *   - non-empty CHECK constraints on all required text columns (§3.1)
 *   - `timestamptz` (UTC) timestamps with `now()` defaults (§3.1)
 *   - indexes incl. board index + trigram title index (§3.5)
 *
 * Drizzle-kit generates migration SQL from this file. A few DB-level guarantees
 * that drizzle-kit cannot express in generated SQL (extensions, the functional
 * trigram GIN index, and the composite-FK target) are hand-added/verified in the
 * migration SQL under `db/migrations/` — see that file for the authoritative DDL.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * `citext` (case-insensitive text) column type.
 *
 * Drizzle has no first-class citext helper, so we declare a custom type that
 * emits the `citext` SQL data type. The extension itself is created in the first
 * migration (§3.6). A plain UNIQUE on a citext column yields case-insensitive
 * uniqueness (§3.1).
 */
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

// --- Enums (§3.4) ----------------------------------------------------------

/** Ticket classification. Canonical lowercase API values. */
export const ticketTypeEnum = pgEnum("ticket_type", ["bug", "feature", "fix"]);

/** Ticket workflow state. Canonical lowercase/underscore API values. */
export const ticketStateEnum = pgEnum("ticket_state", [
  "new",
  "ready_for_implementation",
  "in_progress",
  "ready_for_acceptance",
  "done",
]);

// --- Shared column builders -------------------------------------------------

/** `created_at timestamptz NOT NULL DEFAULT now()` (stored UTC). */
const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

/**
 * `modified_at timestamptz NOT NULL DEFAULT now()` (stored UTC).
 *
 * Advanced by the service layer on a real field/state change only — never by a
 * blanket DB trigger (§3.1).
 */
const modifiedAt = () =>
  timestamp("modified_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

// --- users (§3.2) ----------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: citext("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    createdAt: createdAt(),
    modifiedAt: modifiedAt(),
  },
  (t) => [
    check("users_email_nonempty_check", sql`length(btrim(${t.email})) > 0`),
  ],
);

// --- verification_tokens (§3.2) --------------------------------------------

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("verification_tokens_user_id_idx").on(t.userId)],
);

// --- teams (§3.2) ----------------------------------------------------------

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: citext("name").notNull().unique(),
    createdAt: createdAt(),
    modifiedAt: modifiedAt(),
  },
  (t) => [check("teams_name_nonempty_check", sql`length(btrim(${t.name})) > 0`)],
);

// --- epics (§3.2) ----------------------------------------------------------

export const epics = pgTable(
  "epics",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    modifiedAt: modifiedAt(),
  },
  (t) => [
    // Redundant unique that serves as the target for the tickets composite FK
    // (epic_id, team_id) -> epics(id, team_id) (§3.2).
    unique("epics_id_team_id_key").on(t.id, t.teamId),
    index("epics_team_id_idx").on(t.teamId),
    check("epics_title_nonempty_check", sql`length(btrim(${t.title})) > 0`),
  ],
);

// --- tickets (§3.2) --------------------------------------------------------

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    epicId: uuid("epic_id"),
    type: ticketTypeEnum("type").notNull(),
    state: ticketStateEnum("state").notNull().default("new"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    modifiedAt: modifiedAt(),
  },
  (t) => [
    // Composite FK guaranteeing an epic belongs to the same team as its ticket.
    // epic_id is nullable: a row with NULL epic_id is exempt from this FK
    // (SQL MATCH SIMPLE — the default — skips the check when any column is NULL),
    // so unassigned tickets are allowed (§3.2).
    foreignKey({
      name: "tickets_epic_id_team_id_fkey",
      columns: [t.epicId, t.teamId],
      foreignColumns: [epics.id, epics.teamId],
    }).onDelete("restrict"),
    // Board query: columns by team+state, within-column ordering by recency (§3.5).
    index("tickets_team_state_modified_idx").on(
      t.teamId,
      t.state,
      t.modifiedAt.desc(),
    ),
    index("tickets_team_id_idx").on(t.teamId),
    index("tickets_epic_id_idx").on(t.epicId),
    check("tickets_title_nonempty_check", sql`length(btrim(${t.title})) > 0`),
    check("tickets_body_nonempty_check", sql`length(btrim(${t.body})) > 0`),
  ],
);

// --- comments (§3.2) -------------------------------------------------------

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("comments_ticket_id_created_at_idx").on(t.ticketId, t.createdAt),
    check("comments_body_nonempty_check", sql`length(btrim(${t.body})) > 0`),
  ],
);

/** All application tables, useful for generic operations (e.g. count checks). */
export const schema = {
  users,
  verificationTokens,
  teams,
  epics,
  tickets,
  comments,
};
