/**
 * Reusable embedded-PostgreSQL test harness.
 *
 * Boots a real, throwaway PostgreSQL 18 cluster (via `embedded-postgres`), runs
 * the project migrations against a fresh database, and hands back a Drizzle
 * client plus a teardown. Every integration/migration test should obtain its DB
 * through {@link setupTestDb} so the suite exercises the actual SQL — native
 * enums, citext, pg_trgm, composite FKs, CHECK constraints — not a mock.
 *
 * Critical environment rule: the cluster's data directory MUST live on VM-local
 * storage (`os.tmpdir()`), never under the repo mount — `initdb`/cleanup cannot
 * operate on the FUSE mount. A unique temp dir + random free port per call keeps
 * parallel test files isolated.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { runMigrations } from "../../scripts/migrate";

/** A booted test database: a Drizzle client, its raw URL, and a teardown. */
export interface TestDb {
  /** Drizzle client bound to the migrated test database. */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Raw `postgres` connection (for raw SQL probes in tests). */
  sql: ReturnType<typeof postgres>;
  /** Connection string for the migrated database. */
  url: string;
  /** Stop the cluster and remove its data dir. Always call this in afterAll. */
  teardown: () => Promise<void>;
}

const PG_USER = "test";
const PG_PASSWORD = "test";
const APP_DB = "ticketing_test";

/** Find a free TCP port by binding to port 0 and reading the assigned one. */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not determine a free port."));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Boot an embedded Postgres, create a fresh application database, run all
 * migrations against it, and return a ready-to-use Drizzle client + teardown.
 */
export async function setupTestDb(): Promise<TestDb> {
  const databaseDir = await mkdtemp(join(tmpdir(), "ticketing-pg-"));
  const port = await getFreePort();

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(APP_DB);

  const url = `postgres://${PG_USER}:${PG_PASSWORD}@localhost:${port}/${APP_DB}`;

  // Apply migrations through the production runner so tests exercise the exact
  // same code path the compose `migrate` service uses.
  await runMigrations(url);

  const sql = postgres(url, { max: 5 });
  const db = drizzle(sql, { schema });

  const teardown = async (): Promise<void> => {
    await sql.end({ timeout: 5 });
    await pg.stop();
    await rm(databaseDir, { recursive: true, force: true });
  };

  return { db, sql, url, teardown };
}
