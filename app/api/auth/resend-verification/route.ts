/**
 * POST /api/auth/resend-verification (plan §4.3).
 *
 * Public endpoint. If (and only if) an unverified account exists for the email,
 * invalidates prior unused tokens, issues a fresh one, and sends a new
 * verification email. ALWAYS returns a generic `{ ok: true }` so the response is
 * identical whether or not the account exists — no account enumeration.
 *
 * Rate-limited (in-memory fixed window) keyed by normalized email + client IP to
 * prevent inbox flooding / probing; over the limit → 429.
 *
 * Response 200: `{ ok: true }`.
 * Errors: 400 invalid email, 429 rate limited.
 */
import type { NextRequest } from "next/server";

import {
  resendVerification,
  resendVerificationSchema,
} from "@/server/services/auth.service";
import { resendRateLimiter } from "@/server/auth/rate-limit";
import { parseOrThrow } from "@/lib/validation";
import { rateLimitedError, validationError } from "@/server/http/errors";
import { errorResponse, jsonOk } from "@/server/http/respond";

/** Best-effort client IP from common proxy headers (falls back to "unknown"). */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // First hop is the original client.
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON");
    }

    // Validate here so a malformed email is a 400 *before* the rate-limit check
    // consumes budget, and so we have a normalized key.
    const { email } = parseOrThrow(resendVerificationSchema, body);

    const key = `${email}|${clientIp(request)}`;
    if (!resendRateLimiter.hit(key).allowed) {
      throw rateLimitedError();
    }

    // Generic outcome regardless of whether an email was actually sent.
    await resendVerification({ email });
    return jsonOk({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
