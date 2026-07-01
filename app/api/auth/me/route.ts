/**
 * GET /api/auth/me (plan §4.2).
 *
 * Authenticated endpoint used by the SPA to bootstrap the session. Returns the
 * current user derived from the signed session cookie.
 *
 * Response 200: `{ id, email, emailVerified }`.
 * Errors: 401 when there is no valid session, or it references a user that no
 * longer exists.
 *
 * Note: unlike `requireUser` (which 403s unverified users on protected app
 * endpoints), `/me` intentionally returns the identity regardless of
 * `emailVerified` so the SPA can show the "verify your email" state. In practice
 * a session is only ever issued to verified users at login.
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { readSession } from "@/server/auth/session";
import { unauthenticatedError } from "@/server/http/errors";
import { errorResponse, jsonOk } from "@/server/http/respond";

export async function GET() {
  try {
    const session = await readSession();
    if (session === null) {
      throw unauthenticatedError();
    }

    const rows = await db
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
      throw unauthenticatedError();
    }

    return jsonOk(user);
  } catch (error) {
    return errorResponse(error);
  }
}
