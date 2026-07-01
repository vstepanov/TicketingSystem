/**
 * NextResponse builders for the JSON API (plan §4.1).
 *
 * These are the single place that turns a service result or a thrown error into
 * an HTTP response, so the wire contract — status codes, the error envelope
 * shape, and ISO-8601 UTC timestamp serialization — is enforced in exactly one
 * spot and reused by every route handler.
 */
import { NextResponse } from "next/server";

import { toErrorResponse } from "./errors";

/**
 * Recursively convert `Date` values to ISO-8601 UTC strings while copying the
 * rest of the structure untouched. This guarantees "all responses use ISO-8601
 * UTC strings" (§4.1) regardless of whether a service returned raw `Date`
 * objects (Drizzle `mode: "date"` columns do).
 */
function serialize<T>(value: T): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serialize);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(val);
    }
    return out;
  }
  return value;
}

/**
 * Build a success JSON response with the given status (default `200`). `Date`
 * values anywhere in `body` are serialized to ISO-8601 UTC.
 */
export function jsonOk<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(serialize(body), { status });
}

/** `201 Created` with a serialized JSON body. */
export function jsonCreated<T>(body: T): NextResponse {
  return jsonOk(body, 201);
}

/** `204 No Content` (empty body). */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Build an error response from any thrown value. Delegates to
 * {@link toErrorResponse} so `AppError`s and mapped Postgres driver errors
 * (23503/23505 → 409) all render as the standard envelope with the right status.
 */
export function errorResponse(error: unknown): NextResponse {
  const { status, envelope } = toErrorResponse(error);
  return NextResponse.json(envelope, { status });
}
