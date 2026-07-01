/**
 * POST /api/auth/login (plan §4.2).
 *
 * Public endpoint. Verifies the Argon2id password hash and requires a verified
 * email; on success it issues the HttpOnly session cookie (never a token in the
 * URL) and returns the user identity.
 *
 * Response 200: `{ id, email }` + `Set-Cookie` session.
 * Errors: 400 missing fields, 401 bad credentials (generic), 403
 * `ACCOUNT_NOT_VERIFIED` (drives the "Resend email" UI).
 */
import type { NextRequest } from "next/server";

import { login } from "@/server/services/auth.service";
import { setSessionCookie } from "@/server/auth/session";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonOk } from "@/server/http/respond";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON");
    }

    const user = await login(body);
    // Issue the session cookie only after successful authentication.
    await setSessionCookie(user.id);

    return jsonOk({ id: user.id, email: user.email });
  } catch (error) {
    return errorResponse(error);
  }
}
