import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { users, verificationTokens } from "@/server/db/schema";
import type { AppError } from "@/server/http/errors";
import { setupTestDb, type TestDb } from "../helpers/pg";

// Services read the typed `env` on first access; provide a full valid env first.
process.env.SESSION_SECRET ??= "verify-integration-secret-of-sufficient-length";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let verifyEmail: typeof import("@/server/services/auth.service").verifyEmail;
let consumeVerificationToken: typeof import("@/server/services/token.service").consumeVerificationToken;
let generateRawToken: typeof import("@/server/services/token.service").generateRawToken;
let hashToken: typeof import("@/server/services/token.service").hashToken;
let computeExpiry: typeof import("@/server/services/token.service").computeExpiry;

function newEmail(): string {
  return `u${Math.random().toString(36).slice(2)}@example.com`;
}

async function insertUnverifiedUser(): Promise<string> {
  const [row] = await ctx.db
    .insert(users)
    .values({ email: newEmail(), passwordHash: "x", emailVerified: false })
    .returning({ id: users.id });
  return row.id;
}

/** Insert a verification token for a user with an explicit expiry/consumed. */
async function insertToken(
  userId: string,
  opts: { expiresAt: Date; consumedAt?: Date | null },
): Promise<string> {
  const raw = generateRawToken();
  await ctx.db.insert(verificationTokens).values({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: opts.expiresAt,
    consumedAt: opts.consumedAt ?? null,
  });
  return raw;
}

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected the call to throw");
}

beforeAll(async () => {
  ctx = await setupTestDb();
  ({ verifyEmail } = await import("@/server/services/auth.service"));
  ({ consumeVerificationToken, generateRawToken, hashToken, computeExpiry } =
    await import("@/server/services/token.service"));
});

afterAll(async () => {
  await ctx.teardown();
});

describe("verify (single-use consumption + expiry, plan §4.3)", () => {
  it("verifies the user and consumes the token on a valid token", async () => {
    const userId = await insertUnverifiedUser();
    const raw = await insertToken(userId, { expiresAt: computeExpiry() });

    const result = await verifyEmail({ token: raw }, ctx.db);
    expect(result).toEqual({ verified: true });

    const [user] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(user.emailVerified).toBe(true);

    const [tok] = await ctx.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, userId));
    expect(tok.consumedAt).not.toBeNull();
  });

  it("is single-use: a second verify with the same token → 410", async () => {
    const userId = await insertUnverifiedUser();
    const raw = await insertToken(userId, { expiresAt: computeExpiry() });

    await verifyEmail({ token: raw }, ctx.db);
    const err = await expectAppError(verifyEmail({ token: raw }, ctx.db));
    expect(err.code).toBe("TOKEN_EXPIRED_OR_INVALID");
    expect(err.status).toBe(410);
  });

  it("rejects an already-consumed token with 410", async () => {
    const userId = await insertUnverifiedUser();
    const raw = await insertToken(userId, {
      expiresAt: computeExpiry(),
      consumedAt: new Date(),
    });
    const err = await expectAppError(
      consumeVerificationToken(raw, ctx.db),
    );
    expect(err.status).toBe(410);
    // User stays unverified — a consumed token cannot re-verify.
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(user.emailVerified).toBe(false);
  });

  it("rejects an expired token with 410 and leaves the user unverified", async () => {
    const userId = await insertUnverifiedUser();
    const raw = await insertToken(userId, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const err = await expectAppError(verifyEmail({ token: raw }, ctx.db));
    expect(err.code).toBe("TOKEN_EXPIRED_OR_INVALID");
    expect(err.status).toBe(410);
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(user.emailVerified).toBe(false);
  });

  it("rejects an unknown token with 410", async () => {
    const err = await expectAppError(
      verifyEmail({ token: generateRawToken() }, ctx.db),
    );
    expect(err.status).toBe(410);
  });

  it("rejects a missing/blank token with 400 (not 410)", async () => {
    const err = await expectAppError(verifyEmail({ token: "  " }, ctx.db));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
  });
});
