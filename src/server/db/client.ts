/**
 * Database client (persistence tier entry point).
 *
 * Wraps a single `postgres` (postgres.js) connection pool in a Drizzle client.
 * The application and the repository layer import {@link db} for all queries;
 * nothing else opens a raw connection.
 *
 * The connection is created lazily on first access so that importing this module
 * (e.g. from a unit test, or from the schema for type-only use) does not require
 * a live database or a populated `DATABASE_URL`. Test harnesses that need a
 * client against an ephemeral Postgres should build their own via
 * {@link createDbClient} (see `tests/helpers/pg.ts`).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * A Drizzle transaction handle — the value passed to a `db.transaction(tx => …)`
 * callback. Structurally it is the query-builder subset of {@link Database}
 * (without `$client`), so it cannot be assigned to `Database` directly.
 */
export type Transaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

/**
 * Either the top-level client or a transaction handle. Repository/service
 * functions accept this so they can run standalone or inside a transaction.
 */
export type DbClient = Database | Transaction;

/**
 * Build a Drizzle client bound to an explicit connection string.
 *
 * Returns both the Drizzle handle and the underlying `postgres` connection so
 * callers can close it cleanly (important for short-lived processes and tests).
 */
export function createDbClient(connectionString: string): {
  db: Database;
  sql: ReturnType<typeof postgres>;
} {
  const client = postgres(connectionString, { max: 10 });
  return { db: drizzle(client, { schema }), sql: client };
}

let cached: { db: Database; sql: ReturnType<typeof postgres> } | undefined;

function get() {
  if (cached === undefined) {
    cached = createDbClient(env.DATABASE_URL);
  }
  return cached;
}

/**
 * The shared application database client, resolved lazily on first property
 * access against the validated `DATABASE_URL`.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    return get().db[prop as keyof Database];
  },
});
