/**
 * Playwright globalTeardown for the E2E suite (S20).
 *
 * Stops the ephemeral Postgres + SMTP capture server started by global-setup.ts
 * and removes the runtime handoff file. The live stop function was stashed on
 * the Node global by globalSetup (Playwright runs both hooks in one process).
 */
import { rm } from "node:fs/promises";

import { RUNTIME_FILE } from "./runtime";

export default async function globalTeardown(): Promise<void> {
  const g = globalThis as typeof globalThis & {
    __E2E_TEARDOWN__?: () => Promise<void>;
  };
  if (typeof g.__E2E_TEARDOWN__ === "function") {
    await g.__E2E_TEARDOWN__();
  }
  await rm(RUNTIME_FILE, { force: true });
}
