/**
 * Database readiness probe (plan §4.9).
 *
 * A single, injectable check that runs `SELECT 1` against the database so the
 * readiness route (`GET /api/ready`) can report whether the persistence tier is
 * reachable. The probe is deliberately tiny and dependency-light:
 *
 *   - It accepts an explicit {@link DbClient} so tests can inject a failing or
 *     closed connection and assert the "db down → 503" path without Docker.
 *   - It never throws: any error (connection refused, query failure, timeout) is
 *     swallowed and reported as `ready: false`, so the route handler can map it
 *     straight to a 503 without a try/catch of its own.
 */
import { sql } from "drizzle-orm";

import { db as sharedDb, type DbClient } from "./client";

/** Result of a readiness probe. `ready` is the only field callers need. */
export interface ReadinessResult {
  ready: boolean;
}

/**
 * Run a lightweight `SELECT 1` against the given database client (defaults to
 * the shared application client). Returns `{ ready: true }` when the query
 * succeeds and `{ ready: false }` for any failure — it never rejects.
 */
export async function checkDbReadiness(
  client: DbClient = sharedDb,
): Promise<ReadinessResult> {
  try {
    await client.execute(sql`SELECT 1`);
    return { ready: true };
  } catch {
    return { ready: false };
  }
}
