/**
 * Migration runner.
 *
 * Applies every pending forward-only migration in `db/migrations/` against
 * `DATABASE_URL`, using Drizzle's Postgres migrator. Used by:
 *
 *   - the compose `migrate` one-shot service (`npm run db:migrate`), which gates
 *     `web` startup (§2.4), and
 *   - the integration/migration test harness (`tests/helpers/pg.ts`), which calls
 *     {@link runMigrations} directly against an ephemeral embedded-postgres.
 *
 * Drizzle's migrator records applied migrations in `__drizzle_migrations` and
 * skips ones already applied, so re-running is idempotent (§3.6).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Absolute-or-relative path to the generated migrations folder. */
export const MIGRATIONS_FOLDER = "db/migrations";

/**
 * Apply all pending migrations against the given connection string.
 *
 * Opens a dedicated single connection (migrations must run serially), applies
 * pending files, then closes the connection. Safe to call repeatedly.
 */
export async function runMigrations(
  connectionString: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  // `max: 1` — the migrator must not run statements concurrently.
  const sql = postgres(connectionString, { max: 1 });
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** CLI entry point: read DATABASE_URL, run migrations, exit. */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }
  await runMigrations(connectionString);
  console.log("Migrations applied successfully.");
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  /scripts[/\\]migrate\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
