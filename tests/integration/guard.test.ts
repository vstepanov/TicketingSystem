import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { users } from "@/server/db/schema";
import type { AppError } from "@/server/http/errors";
import { createSessionToken } from "@/server/auth/session";
import { setupTestDb, type TestDb } from "../helpers/pg";

// Control the session cookie the guard reads. The mocked store returns whatever
// token the current test set via `setCookieToken`.
let cookieToken: string | undefined;
function setCookieToken(token: string | undefined): void {
  cookieToken = token;
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" && cookieToken !== undefined
        ? { name, value: cookieToken }
        : undefined,
  }),
}));

// Pin a known secret so tokens signed here verify inside the guard. The guard's
// default signing path reads the typed `env` (which validates the WHOLE
// environment on first access), so a full valid env must be present before it is
// imported.
const SECRET = "guard-integration-secret-of-sufficient-length";
process.env.SESSION_SECRET = SECRET;
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let requireUser: typeof import("@/server/auth/guard").requireUser;

beforeAll(async () => {
  ctx = await setupTestDb();
  ({ requireUser } = await import("@/server/auth/guard"));
});

afterAll(async () => {
  await ctx.teardown();
});

async function insertUser(emailVerified: boolean): Promise<string> {
  const [row] = await ctx.db
    .insert(users)
    .values({
      email: `u${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: "x",
      emailVerified,
    })
    .returning({ id: users.id });
  return row.id;
}

async function expectAppError(
  promise: Promise<unknown>,
): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected requireUser to throw");
}

describe("requireUser guard", () => {
  it("returns the user for a verified account with a valid session", async () => {
    const id = await insertUser(true);
    setCookieToken(createSessionToken(id, SECRET));
    const user = await requireUser(ctx.db);
    expect(user.id).toBe(id);
    expect(user.emailVerified).toBe(true);
  });

  it("throws 401 UNAUTHENTICATED when no session cookie is present", async () => {
    setCookieToken(undefined);
    const err = await expectAppError(requireUser(ctx.db));
    expect(err.code).toBe("UNAUTHENTICATED");
    expect(err.status).toBe(401);
  });

  it("throws 401 for a tampered/invalid session token", async () => {
    setCookieToken("bogus.token");
    const err = await expectAppError(requireUser(ctx.db));
    expect(err.status).toBe(401);
  });

  it("throws 401 when the session references a missing user", async () => {
    setCookieToken(
      createSessionToken("99999999-9999-9999-9999-999999999999", SECRET),
    );
    const err = await expectAppError(requireUser(ctx.db));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("throws 403 ACCOUNT_NOT_VERIFIED for an unverified user", async () => {
    const id = await insertUser(false);
    setCookieToken(createSessionToken(id, SECRET));
    const err = await expectAppError(requireUser(ctx.db));
    expect(err.code).toBe("ACCOUNT_NOT_VERIFIED");
    expect(err.status).toBe(403);
  });
});
