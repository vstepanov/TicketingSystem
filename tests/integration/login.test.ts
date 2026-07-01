import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { users } from "@/server/db/schema";
import type { AppError } from "@/server/http/errors";
import { hashPassword } from "@/server/auth/password";
import { setupTestDb, type TestDb } from "../helpers/pg";

process.env.SESSION_SECRET ??= "login-integration-secret-of-sufficient-length";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let login: typeof import("@/server/services/auth.service").login;

const PASSWORD = "supersecret";

function newEmail(): string {
  return `u${Math.random().toString(36).slice(2)}@example.com`;
}

async function insertUser(opts: {
  email?: string;
  emailVerified: boolean;
  password?: string;
}): Promise<{ id: string; email: string }> {
  const email = opts.email ?? newEmail();
  const passwordHash = await hashPassword(opts.password ?? PASSWORD);
  const [row] = await ctx.db
    .insert(users)
    .values({ email, passwordHash, emailVerified: opts.emailVerified })
    .returning({ id: users.id, email: users.email });
  return row;
}

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected login to throw");
}

beforeAll(async () => {
  ctx = await setupTestDb();
  ({ login } = await import("@/server/services/auth.service"));
});

afterAll(async () => {
  await ctx.teardown();
});

describe("login service (integration, plan §4.2)", () => {
  it("returns the identity for correct credentials on a verified account", async () => {
    const user = await insertUser({ emailVerified: true });
    const result = await login(
      { email: user.email, password: PASSWORD },
      ctx.db,
    );
    expect(result).toEqual({ id: user.id, email: user.email });
  });

  it("is case-insensitive on the email", async () => {
    const user = await insertUser({ emailVerified: true });
    const result = await login(
      { email: user.email.toUpperCase(), password: PASSWORD },
      ctx.db,
    );
    expect(result.id).toBe(user.id);
  });

  it("rejects a wrong password with a generic 401", async () => {
    const user = await insertUser({ emailVerified: true });
    const err = await expectAppError(
      login({ email: user.email, password: "wrong-password" }, ctx.db),
    );
    expect(err.code).toBe("UNAUTHENTICATED");
    expect(err.status).toBe(401);
  });

  it("rejects an unknown email with the same generic 401", async () => {
    const err = await expectAppError(
      login({ email: newEmail(), password: PASSWORD }, ctx.db),
    );
    expect(err.code).toBe("UNAUTHENTICATED");
    expect(err.status).toBe(401);
  });

  it("rejects an unverified account with 403 ACCOUNT_NOT_VERIFIED (correct pw)", async () => {
    const user = await insertUser({ emailVerified: false });
    const err = await expectAppError(
      login({ email: user.email, password: PASSWORD }, ctx.db),
    );
    expect(err.code).toBe("ACCOUNT_NOT_VERIFIED");
    expect(err.status).toBe(403);
  });

  it("returns 400 with field errors on missing fields", async () => {
    const err = await expectAppError(login({ email: "" }, ctx.db));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(err.fields).toBeDefined();
  });
});
