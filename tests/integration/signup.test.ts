import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { users, verificationTokens } from "@/server/db/schema";
import type { AppError } from "@/server/http/errors";
import { setupTestDb, type TestDb } from "../helpers/pg";

// auth/mail services read the typed `env` (validates the WHOLE environment on
// first access), so a full valid env must exist before they are imported.
process.env.SESSION_SECRET ??= "signup-integration-secret-of-sufficient-length";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let signup: typeof import("@/server/services/auth.service").signup;
let hashToken: typeof import("@/server/services/token.service").hashToken;

/** A capturing fake transport so tests never hit a real relay. */
interface SentMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}
function makeTransport() {
  const sent: SentMessage[] = [];
  return {
    sent,
    transport: {
      async sendMail(message: SentMessage) {
        sent.push(message);
        return { messageId: "test" };
      },
    },
  };
}

function newEmail(): string {
  return `u${Math.random().toString(36).slice(2)}@example.com`;
}

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected signup to throw");
}

beforeAll(async () => {
  ctx = await setupTestDb();
  ({ signup } = await import("@/server/services/auth.service"));
  ({ hashToken } = await import("@/server/services/token.service"));
});

afterAll(async () => {
  await ctx.teardown();
});

describe("signup service (integration)", () => {
  it("creates an unverified user + a hashed verification token and sends mail", async () => {
    const email = newEmail();
    const { transport, sent } = makeTransport();

    const result = await signup(
      { email, password: "supersecret", confirmPassword: "supersecret" },
      ctx.db,
      transport,
    );

    expect(result.emailVerified).toBe(false);
    expect(result.email).toBe(email);
    expect(result.mailSent).toBe(true);

    // User row exists, unverified, password not stored in plain text.
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, result.id));
    expect(user.emailVerified).toBe(false);
    expect(user.passwordHash).not.toBe("supersecret");
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);

    // Exactly one token row, storing a HASH (never the raw token), +24h expiry.
    const tokens = await ctx.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, result.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].consumedAt).toBeNull();
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const ttl = tokens[0].expiresAt.getTime() - tokens[0].createdAt.getTime();
    expect(ttl).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ttl).toBeLessThan(25 * 60 * 60 * 1000);

    // A verification email was "sent"; the link contains the raw token whose
    // hash matches the stored row (proving only the hash is persisted).
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    const match = sent[0].text.match(/token=([A-Za-z0-9_%-]+)/);
    expect(match).not.toBeNull();
    const rawToken = decodeURIComponent(match![1]);
    expect(rawToken).not.toBe(tokens[0].tokenHash);
    expect(hashToken(rawToken)).toBe(tokens[0].tokenHash);
  });

  it("rejects a duplicate email with a generic 409 (case-insensitive)", async () => {
    const email = newEmail();
    const { transport } = makeTransport();
    await signup(
      { email, password: "supersecret", confirmPassword: "supersecret" },
      ctx.db,
      transport,
    );

    const err = await expectAppError(
      signup(
        {
          email: email.toUpperCase(),
          password: "supersecret",
          confirmPassword: "supersecret",
        },
        ctx.db,
        transport,
      ),
    );
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
    // Generic message — must not reveal the email is already registered.
    expect(err.message.toLowerCase()).not.toContain("already");

    // Still exactly one user for that email.
    const rows = await ctx.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });

  it("rolls back the user when the transaction fails (no orphan on dup)", async () => {
    // A duplicate signup must not create a second token row for the winner.
    const email = newEmail();
    const { transport } = makeTransport();
    const first = await signup(
      { email, password: "supersecret", confirmPassword: "supersecret" },
      ctx.db,
      transport,
    );
    await expectAppError(
      signup(
        { email, password: "supersecret", confirmPassword: "supersecret" },
        ctx.db,
        transport,
      ),
    );
    const tokens = await ctx.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, first.id));
    expect(tokens).toHaveLength(1);
  });

  it("keeps the created user even when mail delivery fails", async () => {
    const email = newEmail();
    const failing = {
      async sendMail() {
        throw new Error("SMTP unavailable");
      },
    };
    const result = await signup(
      { email, password: "supersecret", confirmPassword: "supersecret" },
      ctx.db,
      failing,
    );
    expect(result.mailSent).toBe(false);
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, result.id));
    expect(user).toBeDefined();
    expect(user.emailVerified).toBe(false);
  });

  it("throws 400 with field errors on invalid input", async () => {
    const { transport } = makeTransport();
    const err = await expectAppError(
      signup(
        { email: "bad", password: "short", confirmPassword: "nope" },
        ctx.db,
        transport,
      ),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(err.fields).toBeDefined();
  });
});
