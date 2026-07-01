/**
 * Signed session cookie utilities (plan §4.1 auth, ADR-0002).
 *
 * The session is a stateless, HMAC-signed token stored in an HttpOnly cookie —
 * never in a URL. The cookie value is:
 *
 * ```text
 * base64url(payload) "." base64url(HMAC_SHA256(secret, base64url(payload)))
 * ```
 *
 * where `payload` is `{ "uid": <userId>, "exp": <unix seconds> }`. The MAC binds
 * the user id + expiry so any tampering (id swap, expiry extension) is rejected
 * on read via a constant-time signature comparison. `exp` gives server-side
 * expiry independent of the browser's cookie lifetime.
 *
 * Cookie flags (plan §4.1): `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
 * `Secure` is dropped only outside production so local `http://localhost` dev
 * still works; tests and prod always sign/verify identically.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { env } from "@/lib/env";

/** Cookie name carrying the signed session. */
export const SESSION_COOKIE_NAME = "session";

/** Session lifetime: 7 days, expressed in seconds. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Decoded session payload. */
export interface SessionPayload {
  /** Authenticated user id (UUID). */
  userId: string;
  /** Absolute expiry, unix epoch seconds (UTC). */
  expiresAt: number;
}

/** Wire payload shape (compact keys keep the cookie small). */
interface WirePayload {
  uid: string;
  exp: number;
}

function base64urlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

/**
 * Build a signed cookie value for `userId`, expiring `ttlSeconds` from now.
 * Exported (alongside {@link verifySessionToken}) so the signing scheme is unit
 * testable without a Next.js request context.
 */
export function createSessionToken(
  userId: string,
  secret: string = env.SESSION_SECRET,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const payload: WirePayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = base64urlEncode(sign(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

/**
 * Verify a signed cookie value. Returns the decoded {@link SessionPayload} when
 * the signature is valid and the token has not expired, otherwise `null`.
 * Constant-time signature comparison rejects tampering.
 */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string = env.SESSION_SECRET,
): SessionPayload | null {
  if (!token) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const encodedPayload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = base64urlEncode(sign(encodedPayload, secret));
  const providedBuf = Buffer.from(providedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as WirePayload).uid !== "string" ||
    typeof (parsed as WirePayload).exp !== "number"
  ) {
    return null;
  }

  const { uid, exp } = parsed as WirePayload;
  if (exp <= Math.floor(Date.now() / 1000)) {
    return null; // expired
  }

  return { userId: uid, expiresAt: exp };
}

/**
 * Read and verify the session from the incoming request cookies. Returns the
 * decoded payload or `null` when absent/invalid/expired. Safe to call from any
 * Route Handler.
 */
export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

/**
 * Issue the session cookie for `userId` on the response, with the standard
 * security flags (HttpOnly, Secure in prod, SameSite=Lax, Path=/).
 */
export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Clear the session cookie (logout). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
