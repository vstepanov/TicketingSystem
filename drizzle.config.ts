/**
 * drizzle-kit configuration.
 *
 * Points at the schema source of truth and the forward-only SQL migrations
 * directory (§3.6). `npm run db:generate` diffs the schema against the existing
 * migrations and writes a new SQL file under `db/migrations/`.
 *
 * `DATABASE_URL` is only needed for drizzle-kit's introspection/push commands,
 * not for `generate`; a placeholder keeps `generate` runnable without a live DB.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/placeholder",
  },
  // Verbose, reviewable migrations; never auto-apply on generate.
  verbose: true,
  strict: true,
});
