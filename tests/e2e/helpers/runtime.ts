/**
 * Shared runtime handoff for the E2E stack.
 *
 * Playwright's `globalSetup` (which boots an ephemeral Postgres + the SMTP
 * capture server) runs in a *different* process from both the `webServer` that
 * Playwright spawns and the worker processes that run the specs. They cannot
 * share in-memory state, so globalSetup writes the dynamically chosen ports and
 * connection strings to this small JSON file, and every other process reads it
 * back. The file lives on VM-local temp storage (never the repo mount).
 */
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Fixed, predictable path so all E2E processes agree without extra env. */
export const RUNTIME_FILE = join(tmpdir(), "ticketing-e2e-runtime.json");

/** Everything the webServer + specs need to reach the ephemeral backends. */
export interface E2eRuntime {
  /** Full DATABASE_URL for the ephemeral Postgres. */
  databaseUrl: string;
  /** Base URL the app is served on (also Playwright's baseURL). */
  appUrl: string;
  /** Host/port the app HTTP server binds to. */
  appPort: number;
  /** SMTP capture server port (app SMTP_PORT points here). */
  smtpPort: number;
  /** Path to the captured-mail JSON file (specs read it for the token). */
  mailboxFile: string;
}

/** Persist the runtime handoff (called by globalSetup). */
export async function writeRuntime(runtime: E2eRuntime): Promise<void> {
  await writeFile(RUNTIME_FILE, JSON.stringify(runtime, null, 2));
}

/** Read the runtime handoff (called by the launcher + specs). */
export async function readRuntime(): Promise<E2eRuntime> {
  const raw = await readFile(RUNTIME_FILE, "utf8");
  return JSON.parse(raw) as E2eRuntime;
}
