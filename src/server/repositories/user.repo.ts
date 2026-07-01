/**
 * User repository (persistence tier, plan §4 layering).
 *
 * Keeps all Drizzle access to the `users` table in one place so services never
 * touch SQL directly. Every function takes the Drizzle client explicitly (the
 * shared app client by default) so callers can pass a transaction handle or an
 * ephemeral test client.
 */
import { eq } from "drizzle-orm";

import { db as defaultDb, type DbClient } from "@/server/db/client";
import { users } from "@/server/db/schema";

/** A persisted user row (all columns). */
export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: Date;
  modifiedAt: Date;
}

/** Values needed to create a new user. */
export interface NewUser {
  email: string;
  passwordHash: string;
}

/**
 * Look up a user by (case-insensitive) email. `email` is a `citext` column so a
 * plain equality match is case-insensitive; callers still normalise (trim +
 * lowercase) before calling for consistency.
 */
export async function findUserByEmail(
  email: string,
  database: DbClient = defaultDb,
): Promise<UserRow | undefined> {
  const rows = await database
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0];
}

/**
 * Insert a new user with `email_verified = false`. A duplicate email raises a
 * Postgres unique violation (23505); the caller maps it to a generic 409 to
 * limit account enumeration.
 */
export async function insertUser(
  values: NewUser,
  database: DbClient = defaultDb,
): Promise<UserRow> {
  const [row] = await database
    .insert(users)
    .values({
      email: values.email,
      passwordHash: values.passwordHash,
      emailVerified: false,
    })
    .returning();
  return row;
}

/**
 * Mark a user's email as verified. Called from the verify flow inside the same
 * transaction that consumes the token, so the "verified + token consumed" state
 * is atomic (plan §4.3). Idempotent at the SQL level — setting `email_verified`
 * to `true` again is a no-op.
 */
export async function markUserVerified(
  id: string,
  database: DbClient = defaultDb,
): Promise<void> {
  await database
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, id));
}
