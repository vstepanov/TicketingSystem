/**
 * POST /api/auth/signup (plan §4.2).
 *
 * Public endpoint. The route handler is a thin HTTP boundary: it parses the JSON
 * body, delegates all business rules to the auth service, and renders the
 * standard success/error envelope. No auto-login (no session cookie is set).
 *
 * Response 201: `{ id, email, emailVerified: false }`.
 * Errors: 400 invalid input, 409 duplicate email (generic message).
 */
import type { NextRequest } from "next/server";

import { signup } from "@/server/services/auth.service";
import { validationError } from "@/server/http/errors";
import { errorResponse, jsonCreated } from "@/server/http/respond";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON");
    }

    const result = await signup(body);

    // Only the public contract fields are returned; `mailSent` stays internal.
    return jsonCreated({
      id: result.id,
      email: result.email,
      emailVerified: result.emailVerified,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
