import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { users, verificationTokens } from "@/server/db/schema";
import { setupTestDb, type TestDb } from "../helpers/pg";

process.env.SESSION_SECRET ??= "resend-integration-secret-of-sufficient-length";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

let ctx: TestDb;
let resendVerification: typeof import("@/server/services/auth.service").resendVerification;
let verifyEmail: typeof import("@/server/services/auth.service").verifyEmail;
let generateRawToken: typeof import("@/server/services/token.service").generateRawToken;
let hashToken: typeof import("@/server/services/token.service").hashToken;
let computeExpiry: typeof import("@/server/services/token.service").computeExpiry;

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

async function insertUser(emailVerified: boolean): Promise<{ id: string; email: string }> {
  const [row] = await ctx.db
    .insert(users)
    .values({ email: newEmail(), passwordHash: "x", emailVerified })
    .returning({ id: users.id, email: users.email });
  return row;
}

/** Seed a prior unused token; returns its raw value. */
async function seedToken(userId: string): Promise<string> {
  const raw = generateRawToken();
  await ctx.db.insert(verificationTokens).values({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: computeExpiry(),
  });
  return raw;
}

beforeAll(async () => {
  ctx = await setupTestDb();
  ({ resendVerification, verifyEmail } = await import(
    "@/server/services/auth.service"
  ));
  ({ generateRawToken, hashToken, computeExpiry } = await import(
    "@/server/services/token.service"
  ));
});

afterAll(async () => {
  await ctx.teardown();
});

describe("resend-verification service (integration, plan §4.3)", () => {
  it("invalidates prior unused tokens and issues a new one for an unverified user", async () => {
    const user = await insertUser(false);
    const oldRaw = await seedToken(user.id);
    const { transport, sent } = makeTransport();

    const result = await resendVerification(
      { email: user.email },
      ctx.db,
      transport,
    );
    expect(result.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(user.email);

    // Exactly one unused token remains (the new one); the old is gone.
    const tokens = await ctx.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, user.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).not.toBe(hashToken(oldRaw));

    // The prior token no longer verifies (invalidated) → 410.
    let oldStillWorks = true;
    try {
      await verifyEmail({ token: oldRaw }, ctx.db);
    } catch {
      oldStillWorks = false;
    }
    expect(oldStillWorks).toBe(false);

    // The new token (from the email link) verifies successfully.
    const match = sent[0].text.match(/token=([A-Za-z0-9_%-]+)/);
    const newRaw = decodeURIComponent(match![1]);
    const verified = await verifyEmail({ token: newRaw }, ctx.db);
    expect(verified).toEqual({ verified: true });
  });

  it("is a generic no-op for an unknown email (no enumeration, no throw)", async () => {
    const { transport, sent } = makeTransport();
    const result = await resendVerification(
      { email: newEmail() },
      ctx.db,
      transport,
    );
    expect(result.sent).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("is a generic no-op for an already-verified account", async () => {
    const user = await insertUser(true);
    const { transport, sent } = makeTransport();
    const result = await resendVerification(
      { email: user.email },
      ctx.db,
      transport,
    );
    expect(result.sent).toBe(false);
    expect(sent).toHaveLength(0);
    // No token created for a verified account.
    const tokens = await ctx.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, user.id));
    expect(tokens).toHaveLength(0);
  });

  it("throws 400 for a malformed email", async () => {
    let status: number | undefined;
    try {
      await resendVerification({ email: "not-an-email" }, ctx.db);
    } catch (err) {
      status = (err as { status?: number }).status;
    }
    expect(status).toBe(400);
  });
});
