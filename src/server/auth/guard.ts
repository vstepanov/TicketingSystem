/**
 * Authentication guard (plan §2.6 request flow, §4.1).
 *
 * `requireUser` is the single entry point every protected Route Handler uses to
 * establish the caller's identity. It reads the signed session cookie, loads the
 * user, and enforces the two auth gates from the plan:
 *
 *   - no / invalid / expired session  → 401 `UNAUTHENTICATED`
 *   - authenticated but email unverified → 403 `ACCOUNT_NOT_VERIFIED`
 *
 * On success it returns the {@link AuthenticatedUser}. It throws {@link AppError}s
 * (never writes a response itself), so the route's `try/catch` + `errorResponse`
 * renders the envelope uniformly.
 */
import { eq } from "drizzle-orm";

import { db as defaultDb, type Database } from "@/server/db/client";
import { users } from "@/server/db/schema";
import {
  accountNotVerifiedError,
  unauthenticatedError,
} from "@/server/http/errors";
import { readSession } from "./session";

/** The authenticated, verified user handed to route handlers. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Resolve the current verified user or throw.
 *
 * @param database Optional Drizzle client (defaults to the shared app client);
 *   injectable for tests.
 * @throws AppError 401 when anonymous/invalid session, 403 when unverified.
 */
export async function requireUser(
  database: Database = defaultDb,
): Promise<AuthenticatedUser> {
  const session = await readSession();
  if (session === null) {
    throw unauthenticatedError();
  }

  const rows = await database
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const user = rows[0];
  if (user === undefined) {
    // Session references a user that no longer exists — treat as anonymous.
    throw unauthenticatedError();
  }

  if (!user.emailVerified) {
    throw accountNotVerifiedError();
  }

  return user;
}
