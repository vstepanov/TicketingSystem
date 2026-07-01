/**
 * E2E app launcher.
 *
 * IMPORTANT ordering note: Playwright starts a configured `webServer` BEFORE it
 * runs `globalSetup`, and it waits for the server's URL to respond before
 * globalSetup executes. That makes the "globalSetup provisions the ephemeral DB,
 * then the webServer reads its connection string" handoff impossible — the
 * launcher would always run first, before the runtime handoff file exists
 * (ENOENT). So this module is NOT wired as Playwright's `webServer.command`.
 * Instead it exports `startApp()`, which globalSetup calls itself AFTER it has
 * booted the ephemeral Postgres + SMTP capture server. globalTeardown stops it.
 *
 * It boots the already-built Next.js standalone server (matching what the Docker
 * `web` image runs); `pretest:e2e` runs `next build` first. If the standalone
 * output isn't present it falls back to `next start`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { E2eRuntime } from "./runtime";

/** Handle to the running app-under-test. */
export interface RunningApp {
  /** Terminate the app process (idempotent). */
  stop: () => Promise<void>;
}

/** Poll the readiness endpoint until it responds 2xx or the deadline passes. */
async function waitForReady(readyUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(readyUrl);
      if (res.ok) return;
      lastError = new Error(`readiness responded ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(
    `App did not become ready at ${readyUrl} within ${timeoutMs}ms` +
      (lastError ? ` (last error: ${String(lastError)})` : ""),
  );
}

/**
 * Start the built app against the ephemeral backends described by `runtime`,
 * injecting the dynamically chosen DATABASE_URL / SMTP port / app port into its
 * environment. Resolves once `/api/ready` responds; the returned `stop()`
 * terminates the process.
 */
export async function startApp(
  runtime: E2eRuntime,
  { readyTimeoutMs = 120_000 }: { readyTimeoutMs?: number } = {},
): Promise<RunningApp> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: runtime.databaseUrl,
    APP_URL: runtime.appUrl,
    PORT: String(runtime.appPort),
    HOSTNAME: "127.0.0.1",
    // Point the app's mailer at the SMTP capture server. Unauthenticated +
    // plaintext (secure:false) — the capture server advertises no AUTH.
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(runtime.smtpPort),
    SMTP_FROM: "Ticket Tracker <no-reply@dataart.com>",
    // A valid-looking 32+ char signing secret for the session cookie.
    SESSION_SECRET:
      process.env.SESSION_SECRET ??
      "e2e-only-session-secret-not-for-production-use-000",
  };

  const standalone = join(process.cwd(), ".next", "standalone", "server.js");
  const useStandalone = existsSync(standalone);

  // Next's `output: "standalone"` does NOT copy `.next/static` or `public/`
  // into the standalone bundle — the production Docker image copies them in
  // itself (see Dockerfile). Without that copy the standalone server serves
  // HTML but every `/_next/static/*` chunk 404s, so the client never hydrates
  // (forms don't submit, verify never leaves its "Verifying…" state, etc.).
  // Mirror the Dockerfile here so the E2E run is self-contained.
  if (useStandalone) {
    const standaloneDir = join(process.cwd(), ".next", "standalone");
    cpSync(
      join(process.cwd(), ".next", "static"),
      join(standaloneDir, ".next", "static"),
      { recursive: true },
    );
    const publicDir = join(process.cwd(), "public");
    if (existsSync(publicDir)) {
      cpSync(publicDir, join(standaloneDir, "public"), { recursive: true });
    }
  }

  const command = useStandalone ? "node" : "npx";
  const args = useStandalone
    ? [standalone]
    : ["next", "start", "-p", String(runtime.appPort)];

  const child: ChildProcess = spawn(command, args, { env, stdio: "inherit" });

  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  const stop = (): Promise<void> =>
    new Promise<void>((resolve) => {
      if (exited || child.pid === undefined) {
        resolve();
        return;
      }
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      // Hard-kill if it hasn't exited promptly.
      setTimeout(() => {
        if (!exited) child.kill("SIGKILL");
      }, 5_000).unref();
    });

  try {
    await waitForReady(`${runtime.appUrl}/api/ready`, readyTimeoutMs);
  } catch (error) {
    if (exited) {
      throw new Error(
        `App process exited before becoming ready ` +
          `(code=${child.exitCode ?? "null"}, signal=${child.signalCode ?? "null"}).`,
      );
    }
    await stop();
    throw error;
  }

  return { stop };
}
