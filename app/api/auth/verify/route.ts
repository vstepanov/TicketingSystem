/**
 * POST /api/auth/verify (plan §4.3).
 *
 * Public endpoint. Consumes a single-use verification token from the emailed
 * link: on success it atomically marks the user's email verified and consumes
 * the token, so the same link cannot be replayed.
 *
 * Response 200: `{ verified: true }`.
 * Errors: 400 missing/blank token, 410 `TOKEN_EXPIRED_OR_INVALID` (missing /
 * expired / already-used — idempotent, no enumeration).
 */
import type { NextRequest } from "next/server";

import { verifyEmail } from "@/server/services/auth.service";
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

    const result = await verifyEmail(body);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
