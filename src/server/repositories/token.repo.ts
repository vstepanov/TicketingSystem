/**
 * Verification-token repository (persistence tier, plan §3.2 / §4.3).
 *
 * All Drizzle access to `verification_tokens` lives here. Only the *hash* of a
 * raw token is ever stored (the raw token travels only in the emailed link).
 * Every function takes the Drizzle client explicitly so it can run inside a
 * transaction (issuing a token invalidates prior unused ones atomically).
 */
import { and, eq, isNull } from "drizzle-orm";

import { db as defaultDb, type DbClient } from "@/server/db/client";
import { verificationTokens } from "@/server/db/schema";

/** A persisted verification-token row. */
export interface VerificationTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

/** Values needed to create a verification token. */
export interface NewVerificationToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Delete every not-yet-consumed token for `userId`.
 *
 * Implements "issuing a new token invalidates earlier unused tokens" (§3.2):
 * hard-deleting the prior unused rows is the simplest single-use guarantee and
 * keeps the table small. Already-consumed rows are left untouched (they document
 * completed verifications). Must be called in the same transaction as the insert.
 */
export async function deleteUnusedTokensForUser(
  userId: string,
  database: DbClient = defaultDb,
): Promise<void> {
  await database
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.userId, userId),
        isNull(verificationTokens.consumedAt),
      ),
    );
}

/** Insert a new verification token (storing the hash, never the raw token). */
export async function insertToken(
  values: NewVerificationToken,
  database: DbClient = defaultDb,
): Promise<VerificationTokenRow> {
  const [row] = await database
    .insert(verificationTokens)
    .values(values)
    .returning();
  return row;
}

/** Look up a token by its hash (used by verify — reused in S06). */
export async function findTokenByHash(
  tokenHash: string,
  database: DbClient = defaultDb,
): Promise<VerificationTokenRow | undefined> {
  const rows = await database
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0];
}

/** Mark a token consumed (single-use). Reused by verify in S06. */
export async function markTokenConsumed(
  id: string,
  consumedAt: Date,
  database: DbClient = defaultDb,
): Promise<void> {
  await database
    .update(verificationTokens)
    .set({ consumedAt })
    .where(eq(verificationTokens.id, id));
}
