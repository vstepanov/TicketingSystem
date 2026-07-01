/**
 * POST /api/auth/logout (plan §4.2).
 *
 * Authenticated endpoint. Clears the session cookie. Returns 204 on success and
 * 401 when there is no valid session (nothing to log out of).
 */
import { readSession, clearSessionCookie } from "@/server/auth/session";
import { unauthenticatedError } from "@/server/http/errors";
import { errorResponse, noContent } from "@/server/http/respond";

export async function POST() {
  try {
    const session = await readSession();
    if (session === null) {
      throw unauthenticatedError();
    }

    await clearSessionCookie();
    return noContent();
  } catch (error) {
    return errorResponse(error);
  }
}
