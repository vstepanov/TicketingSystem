/**
 * Verification-token service (plan §2.7, §3.2, §4.3).
 *
 * Encapsulates the single-use, 24h verification-token lifecycle:
 *
 *   - generate a high-entropy *raw* token (goes only in the emailed link),
 *   - store only its SHA-256 *hash* in the DB (never the raw value, §3.2),
 *   - set `expires_at = now + 24h`,
 *   - invalidate any prior unused tokens for the user in the same transaction
 *     (§3.2: "issuing a new token invalidates earlier unused tokens").
 *
 * The hashing/expiry helpers are pure and exported so unit tests can assert the
 * expiry math and that only a hash — not the raw token — is ever persisted. The
 * verify/consume helpers here are shaped for reuse by S06.
 */
import { createHash, randomBytes } from "node:crypto";

import { db as defaultDb, type Database } from "@/server/db/client";
import { tokenExpiredOrInvalidError } from "@/server/http/errors";
import * as tokenRepo from "@/server/repositories/token.repo";
import * as userRepo from "@/server/repositories/user.repo";

/** Verification-token lifetime: 24 hours, in milliseconds (glossary/§3.2). */
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Bytes of entropy for a raw token (256-bit; encoded base64url ≈ 43 chars). */
const TOKEN_BYTES = 32;

/** A freshly issued token: the raw value to email + its stored DB row. */
export interface IssuedToken {
  /** Raw single-use token — placed in the verification link, never stored. */
  rawToken: string;
  /** Persisted token row (contains only the hash). */
  row: tokenRepo.VerificationTokenRow;
}

/**
 * Generate a cryptographically random, URL-safe raw token. Base64url so it is
 * safe to embed in a query string without escaping.
 */
export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Deterministically hash a raw token for storage/lookup. SHA-256 is appropriate
 * here (unlike passwords): the token is already high-entropy random, so a fast
 * one-way hash suffices and lets us look up by hash. The raw token is never
 * persisted, so a DB leak cannot yield usable links.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Compute the absolute expiry for a token created at `from` (default now). */
export function computeExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + TOKEN_TTL_MS);
}

/** True when `row` is expired relative to `now`. Pure — used by verify + tests. */
export function isExpired(
  row: Pick<tokenRepo.VerificationTokenRow, "expiresAt">,
  now: Date = new Date(),
): boolean {
  return row.expiresAt.getTime() <= now.getTime();
}

/**
 * Issue a fresh verification token for `userId`.
 *
 * Runs in a transaction: it first deletes the user's prior unused tokens (so any
 * earlier link stops working) and then inserts the new one. Returns the raw
 * token (to email) plus the stored row. Reused by signup (S05) and
 * resend-verification (S06).
 *
 * @param database Drizzle client (defaults to the shared app client); pass a
 *   client bound to an ephemeral DB in tests.
 */
export async function issueVerificationToken(
  userId: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<IssuedToken> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = computeExpiry(now);

  const row = await database.transaction(async (tx) => {
    await tokenRepo.deleteUnusedTokensForUser(userId, tx);
    return tokenRepo.insertToken({ userId, tokenHash, expiresAt }, tx);
  });

  return { rawToken, row };
}

/**
 * Consume a raw verification token and mark its owner's email verified (§4.3).
 *
 * The raw token is hashed and looked up; the token is valid only when it exists,
 * has not been consumed, and has not expired. On success — inside a single
 * transaction so the two writes are atomic — the owning user is marked verified
 * and the token's `consumed_at` is set (single-use). Returns the verified user
 * id for the caller.
 *
 * Any failure mode (missing / expired / already-consumed) throws the same
 * `410 TOKEN_EXPIRED_OR_INVALID` error. Using one generic outcome keeps the
 * response idempotent and avoids leaking whether a token ever existed.
 *
 * @param rawToken Raw single-use token from the verification link.
 * @param database Drizzle client (defaults to the shared app client).
 * @param now Reference time for the expiry check (injectable for tests).
 * @throws AppError 410 when the token is missing, expired, or already used.
 */
export async function consumeVerificationToken(
  rawToken: string,
  database: Database = defaultDb,
  now: Date = new Date(),
): Promise<{ userId: string }> {
  const tokenHash = hashToken(rawToken);
  const row = await tokenRepo.findTokenByHash(tokenHash, database);

  if (row === undefined || row.consumedAt !== null || isExpired(row, now)) {
    throw tokenExpiredOrInvalidError();
  }

  await database.transaction(async (tx) => {
    await userRepo.markUserVerified(row.userId, tx);
    await tokenRepo.markTokenConsumed(row.id, now, tx);
  });

  return { userId: row.userId };
}
