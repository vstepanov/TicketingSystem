/**
 * Authentication service (business rules for the auth lifecycle, plan §4.2).
 *
 * This step (S05) implements signup:
 *
 *   1. validate + normalise input (email trimmed/lowercased/valid; password ≥ 8;
 *      password === confirmPassword) — server-side validation is authoritative,
 *   2. Argon2id-hash the password,
 *   3. create the user (`email_verified = false`) and issue a 24h single-use
 *      verification token (storing only its hash) atomically,
 *   4. send the verification email (no auto-login).
 *
 * Duplicate email → 409 with a GENERIC message (limit account enumeration).
 *
 * Mail-failure policy (plan §4.2): the user + token are committed first, in a
 * transaction. Sending the email is a best-effort step *after* commit. If SMTP
 * fails we do NOT roll back the account (that would lose the user and force
 * re-signup); instead the signup still succeeds and the user can trigger the
 * resend-verification path (S06). The mail error is surfaced via
 * {@link SignupResult.mailSent} for logging, never leaked to the client.
 */
import { z } from "zod";

import { db as defaultDb, type Database } from "@/server/db/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  accountNotVerifiedError,
  conflictError,
  unauthenticatedError,
} from "@/server/http/errors";
import { parseOrThrow, trimmedString } from "@/lib/validation";
import * as tokenRepo from "@/server/repositories/token.repo";
import * as userRepo from "@/server/repositories/user.repo";
import {
  computeExpiry,
  consumeVerificationToken,
  generateRawToken,
  hashToken,
  issueVerificationToken,
} from "./token.service";
import { sendVerificationEmail, type MailTransport } from "./mail.service";

/** Postgres unique-violation SQLSTATE (duplicate email). */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Signup input schema (plan §4.2). Email is trimmed + lowercased and format-
 * checked; password must be ≥ 8 chars; confirmPassword must match. Field errors
 * feed the envelope's `fields` map for inline display.
 */
export const signupSchema = z
  .object({
    email: z
      .string({ required_error: "Email is required" })
      .transform((value) => value.trim().toLowerCase())
      .pipe(z.string().email("Enter a valid email address")),
    password: z
      .string({ required_error: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string({
      required_error: "Please confirm your password",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** Validated signup input. */
export type SignupInput = z.infer<typeof signupSchema>;

/** Public signup result — the 201 body plus a mail-delivery flag for logging. */
export interface SignupResult {
  id: string;
  email: string;
  emailVerified: false;
  /** Whether the verification email was sent (false → user should resend). */
  mailSent: boolean;
}

/**
 * Structurally detect a Postgres unique-violation error, walking the `cause`
 * chain. Drizzle's `transaction()` re-throws the driver error wrapped in a plain
 * `Error` whose `.cause` is the `PostgresError` carrying the SQLSTATE, so we
 * check each level.
 */
function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 5) {
    return false;
  }
  if ((error as { code?: unknown }).code === PG_UNIQUE_VIOLATION) {
    return true;
  }
  return isUniqueViolation((error as { cause?: unknown }).cause, depth + 1);
}

/**
 * Register a new user and dispatch a verification email.
 *
 * @param input Raw request body (validated here).
 * @param database Drizzle client (defaults to the shared app client).
 * @param transport Optional mail transport override (tests inject a fake).
 * @throws AppError 400 on invalid input, 409 on duplicate email (generic).
 */
export async function signup(
  input: unknown,
  database: Database = defaultDb,
  transport?: MailTransport,
): Promise<SignupResult> {
  const { email, password } = parseOrThrow(signupSchema, input);

  const passwordHash = await hashPassword(password);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = computeExpiry();

  // Create the user + verification token atomically. A duplicate email trips the
  // unique constraint (23505) → generic 409 to limit account enumeration.
  let userId: string;
  let userEmail: string;
  try {
    const created = await database.transaction(async (tx) => {
      const user = await userRepo.insertUser({ email, passwordHash }, tx);
      // No prior tokens can exist for a brand-new user, but issue via the repo
      // so the single-use invariant is honoured uniformly.
      await tokenRepo.deleteUnusedTokensForUser(user.id, tx);
      await tokenRepo.insertToken(
        { userId: user.id, tokenHash, expiresAt },
        tx,
      );
      return user;
    });
    userId = created.id;
    userEmail = created.email;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError("Could not complete sign up");
    }
    throw error;
  }

  // Best-effort mail AFTER commit: a delivery failure must not lose the account
  // (§4.2). The user can resend from the login/verify screen (S06).
  let mailSent = true;
  try {
    await sendVerificationEmail(userEmail, rawToken, transport);
  } catch (error) {
    mailSent = false;
    console.error("Verification email failed to send", {
      userId,
      cause: error,
    });
  }

  return { id: userId, email: userEmail, emailVerified: false, mailSent };
}

// --- Login (plan §4.2) -----------------------------------------------------

/**
 * Login input schema (plan §4.2). Both fields are required; email is trimmed +
 * lowercased for the case-insensitive lookup. Format is *not* strictly validated
 * here beyond presence: a malformed email simply won't match any user and yields
 * the same generic 401 as a wrong password (no enumeration).
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .min(1, "Email is required")
    .transform((value) => value.trim().toLowerCase()),
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
});

/** Validated login input. */
export type LoginInput = z.infer<typeof loginSchema>;

/** Public login result — the authenticated user identity for the 200 body. */
export interface LoginResult {
  id: string;
  email: string;
}

/**
 * Authenticate a user by email + password (plan §4.2).
 *
 * Looks up the user (case-insensitive), verifies the Argon2id hash, and requires
 * a verified email. The caller (route handler) is responsible for issuing the
 * session cookie on success.
 *
 * @throws AppError 400 on missing fields, 401 on bad credentials (generic — the
 *   same error whether the email is unknown or the password is wrong), 403
 *   `ACCOUNT_NOT_VERIFIED` when the account exists and the password is correct
 *   but the email is unverified (drives the "Resend email" UI).
 */
export async function login(
  input: unknown,
  database: Database = defaultDb,
): Promise<LoginResult> {
  const { email, password } = parseOrThrow(loginSchema, input);

  const user = await userRepo.findUserByEmail(email, database);

  // Generic bad-credentials path: unknown email OR wrong password → 401.
  // We still run verifyPassword against a real-ish hash when the user is missing
  // to keep the timing similar, but a missing user short-circuits to 401.
  if (user === undefined) {
    throw unauthenticatedError("Invalid email or password");
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);
  if (!passwordOk) {
    throw unauthenticatedError("Invalid email or password");
  }

  // Credentials are valid but the account is unverified → 403 (distinct from the
  // 401 above so the UI can offer to resend the verification email).
  if (!user.emailVerified) {
    throw accountNotVerifiedError();
  }

  return { id: user.id, email: user.email };
}

// --- Verify (plan §4.3) ----------------------------------------------------

/**
 * Verify input schema (plan §4.3). The token must be present and non-empty; a
 * missing/blank token is a 400. (An otherwise-shaped token that does not match a
 * live row is a 410 from {@link verifyEmail}.)
 */
export const verifySchema = z.object({
  token: trimmedString("Verification token is required"),
});

/**
 * Verify an email address from a raw verification token (plan §4.3).
 *
 * Validates the body then delegates to {@link consumeVerificationToken}, which
 * atomically marks the user verified and consumes the single-use token. Any
 * missing/expired/already-consumed token surfaces as 410.
 *
 * @throws AppError 400 on a missing/blank token, 410 when the token is invalid.
 */
export async function verifyEmail(
  input: unknown,
  database: Database = defaultDb,
): Promise<{ verified: true }> {
  const { token } = parseOrThrow(verifySchema, input);
  await consumeVerificationToken(token, database);
  return { verified: true };
}

// --- Resend verification (plan §4.3) ---------------------------------------

/**
 * Resend-verification input schema (plan §4.3). Requires a syntactically valid
 * email (a 400 for a malformed one); whether an account exists is never
 * revealed by the response.
 */
export const resendVerificationSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().email("Enter a valid email address")),
});

/**
 * Reissue a verification email for an unverified account (plan §4.3).
 *
 * If — and only if — an *unverified* user exists for the email, this invalidates
 * their prior unused tokens, issues a fresh 24h single-use token, and sends a new
 * verification email. In every case (unknown email, already-verified account,
 * or a genuine resend) the function completes without throwing so the route can
 * return an identical generic 200 — no account enumeration.
 *
 * Rate limiting (the 429 path) is applied at the route boundary, not here.
 *
 * @returns `{ sent }` — whether an email was actually dispatched (for logging /
 *   tests only; never surfaced to the client).
 */
export async function resendVerification(
  input: unknown,
  database: Database = defaultDb,
  transport?: MailTransport,
): Promise<{ sent: boolean }> {
  const { email } = parseOrThrow(resendVerificationSchema, input);

  const user = await userRepo.findUserByEmail(email, database);
  if (user === undefined || user.emailVerified) {
    // No enumeration: silently succeed for unknown or already-verified accounts.
    return { sent: false };
  }

  const { rawToken } = await issueVerificationToken(user.id, database);

  // Best-effort mail (mirrors signup): a delivery failure is logged, not leaked.
  try {
    await sendVerificationEmail(user.email, rawToken, transport);
    return { sent: true };
  } catch (error) {
    console.error("Resend verification email failed to send", {
      userId: user.id,
      cause: error,
    });
    return { sent: false };
  }
}
