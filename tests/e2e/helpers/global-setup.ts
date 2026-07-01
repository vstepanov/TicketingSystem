/**
 * Playwright globalSetup for the full-journey E2E suite (plan §6.1, S20).
 *
 * Brings up the disposable backend the app-under-test talks to:
 *   1. an ephemeral PostgreSQL 18 (via `embedded-postgres`), migrated with the
 *      real migration runner — so the E2E DB has the exact production schema and
 *      starts with ZERO application rows (DoD #9),
 *   2. the in-process SMTP capture server (see mailbox.ts) that intercepts the
 *      verification email so the journey can read the raw token from the link.
 *
 * The chosen ports + connection strings are written to a runtime handoff file
 * (runtime.ts); the launcher (start-app.ts) and specs read them back. Teardown
 * (global-teardown.ts) stops both and removes the temp data.
 *
 * NOTE: this file is authored for correctness but was NOT executed in the
 * authoring sandbox (no Playwright browsers / system deps there). It is meant to
 * be run by `npm run test:e2e` on a developer/CI machine.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";

import { runMigrations } from "../../../scripts/migrate";
import { startMailboxServer } from "./mailbox";
import { writeRuntime, type E2eRuntime } from "./runtime";
import { startApp, type RunningApp } from "./start-app";

const PG_USER = "e2e";
const PG_PASSWORD = "e2e";
const APP_DB = "ticketing_e2e";

/** Path where teardown reads back what to stop/remove. */
const HANDLES_FILE = join(tmpdir(), "ticketing-e2e-handles.json");

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        server.close();
        reject(new Error("Could not determine a free port."));
        return;
      }
      const { port } = addr;
      server.close(() => resolve(port));
    });
  });
}

export default async function globalSetup(): Promise<void> {
  // --- ephemeral Postgres (VM-local data dir; never the FUSE mount) ---
  const databaseDir = await mkdtemp(join(tmpdir(), "ticketing-e2e-pg-"));
  const pgPort = await getFreePort();

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port: pgPort,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(APP_DB);

  const databaseUrl = `postgres://${PG_USER}:${PG_PASSWORD}@localhost:${pgPort}/${APP_DB}`;
  await runMigrations(databaseUrl);

  // --- SMTP capture server ---
  const mailbox = await startMailboxServer();

  // --- app port + base URL ---
  // Deterministic so playwright.config.ts can compute `baseURL` at config-load
  // time (before globalSetup runs). Override with E2E_APP_PORT if 3100 is busy.
  const appPort = Number(process.env.E2E_APP_PORT ?? 3100);
  const appUrl = `http://127.0.0.1:${appPort}`;

  const runtime: E2eRuntime = {
    databaseUrl,
    appUrl,
    appPort,
    smtpPort: mailbox.port,
    mailboxFile: mailbox.mailboxFile,
  };
  await writeRuntime(runtime);

  // Persist just enough for teardown to stop everything. (embedded-postgres and
  // the net server can't be serialised, so teardown re-derives what it can and
  // relies on the OS to reclaim the rest; we stop the DB via a saved data dir.)
  await writeFile(
    HANDLES_FILE,
    JSON.stringify({ databaseDir, pgPort, smtpPort: mailbox.port }),
  );

  // Stash live handles on the Node global so teardown (same process) can stop
  // them cleanly. Playwright runs globalSetup + globalTeardown in one process.
  //
  // We register teardown BEFORE starting the app so a startup failure still
  // tears the backends down (Playwright does not run globalTeardown when
  // globalSetup throws, so we also invoke it ourselves on failure below).
  let app: RunningApp | undefined;
  const g = globalThis as typeof globalThis & {
    __E2E_TEARDOWN__?: () => Promise<void>;
  };
  g.__E2E_TEARDOWN__ = async () => {
    if (app) await app.stop();
    await mailbox.stop();
    await pg.stop();
    await rm(databaseDir, { recursive: true, force: true });
  };

  // Start the built app AFTER the backends exist (see start-app.ts for why this
  // can't be Playwright's `webServer`). Resolves once /api/ready responds.
  try {
    app = await startApp(runtime);
  } catch (error) {
    await g.__E2E_TEARDOWN__();
    throw error;
  }
}
