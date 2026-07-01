/**
 * Error model + HTTP status mapping (plan §4.1).
 *
 * Every failure that reaches the wire is expressed as the standard error
 * envelope:
 *
 * ```json
 * { "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { … } } }
 * ```
 *
 * Business/validation failures are thrown as {@link AppError} instances carrying
 * a stable machine-readable {@link ErrorCode}, an HTTP status, and an optional
 * per-field message map. Lower layers (repositories) may surface raw Postgres
 * driver errors; {@link toAppError} normalises anything thrown into an
 * `AppError`, mapping known SQLSTATEs — foreign-key violation (`23503`) and
 * unique violation (`23505`) — to `409 Conflict` per §3.3.
 */

/**
 * Stable, machine-readable error codes. The frontend keys UI behaviour off
 * these (e.g. `ACCOUNT_NOT_VERIFIED` drives the "Resend email" prompt), so the
 * strings are part of the API contract and must not change casually.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "ACCOUNT_NOT_VERIFIED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOKEN_EXPIRED_OR_INVALID"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** Default HTTP status for each error code (plan §4.1 standard codes). */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  ACCOUNT_NOT_VERIFIED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOKEN_EXPIRED_OR_INVALID: 410,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** Per-field validation messages: `path -> human message`. */
export type FieldErrors = Record<string, string>;

/** The serialized error envelope body (plan §4.1). */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    fields?: FieldErrors;
  };
}

/** Options for constructing an {@link AppError}. */
export interface AppErrorOptions {
  /** Override the default status implied by the code. */
  status?: number;
  /** Per-field validation messages (rendered as `error.fields`). */
  fields?: FieldErrors;
  /** Underlying cause, preserved for logging (never serialized). */
  cause?: unknown;
}

/**
 * Application error carrying everything needed to build an error envelope +
 * HTTP status. Throw these from services/guards; convert at the route boundary
 * with {@link toAppError} / {@link errorResponse}.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.fields = options.fields;
  }

  /** Build the wire envelope for this error. */
  toEnvelope(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };
  }
}

/** Type guard for {@link AppError}. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

// --- Convenience constructors ---------------------------------------------

/** 400 — request failed Zod/business validation. */
export function validationError(
  message = "Validation failed",
  fields?: FieldErrors,
): AppError {
  return new AppError("VALIDATION_ERROR", message, { fields });
}

/** 401 — no/invalid session (anonymous). */
export function unauthenticatedError(message = "Authentication required"): AppError {
  return new AppError("UNAUTHENTICATED", message);
}

/** 403 — authenticated but email not verified. */
export function accountNotVerifiedError(
  message = "Account email is not verified",
): AppError {
  return new AppError("ACCOUNT_NOT_VERIFIED", message);
}

/** 404 — resource not found. */
export function notFoundError(message = "Resource not found"): AppError {
  return new AppError("NOT_FOUND", message);
}

/** 409 — conflict (uniqueness / delete-restrict). */
export function conflictError(message = "Conflict"): AppError {
  return new AppError("CONFLICT", message);
}

/** 410 — verification token expired, used, or invalid. */
export function tokenExpiredOrInvalidError(
  message = "Expired or invalid link",
): AppError {
  return new AppError("TOKEN_EXPIRED_OR_INVALID", message);
}

/** 429 — too many requests (rate limited). */
export function rateLimitedError(
  message = "Too many requests. Please try again later.",
): AppError {
  return new AppError("RATE_LIMITED", message);
}

// --- Postgres driver error mapping ----------------------------------------

/**
 * SQLSTATE codes we recognise and map to friendly conflicts (plan §3.3).
 *
 * Note the two distinct FK-related codes:
 *   - `23503` foreign_key_violation — raised on INSERT/UPDATE that references a
 *     missing parent row.
 *   - `23001` restrict_violation — raised on a DELETE/UPDATE blocked by an
 *     `ON DELETE RESTRICT` FK (e.g. deleting a team that still has tickets/epics).
 * Both express a referential conflict and map to 409 (§3.3).
 */
const PG_FOREIGN_KEY_VIOLATION = "23503";
const PG_RESTRICT_VIOLATION = "23001";
const PG_UNIQUE_VIOLATION = "23505";

/** SQLSTATEs that indicate a referential/uniqueness conflict → HTTP 409. */
const CONFLICT_SQLSTATES = new Set<string>([
  PG_FOREIGN_KEY_VIOLATION,
  PG_RESTRICT_VIOLATION,
  PG_UNIQUE_VIOLATION,
]);

/**
 * Extract a postgres.js SQLSTATE from a thrown value, walking the `cause` chain.
 *
 * The driver exposes the SQLSTATE on a `code` string property. We probe
 * structurally rather than by class so the mapper stays decoupled from the
 * driver. Crucially, Drizzle's `transaction()` (and some query paths) re-throw
 * the driver error wrapped in a plain `Error` whose `.cause` is the underlying
 * `PostgresError` — so the SQLSTATE can live one or more levels down the cause
 * chain. We therefore descend `.cause` (bounded depth) and return the first
 * SQLSTATE found. This guarantees delete-RESTRICT (23503) and unique (23505)
 * violations map to 409 even under the wrapped error shape.
 */
function pgSqlState(value: unknown, depth = 0): string | undefined {
  if (typeof value !== "object" || value === null || depth > 5) {
    return undefined;
  }
  const code = (value as { code?: unknown }).code;
  if (typeof code === "string") {
    return code;
  }
  return pgSqlState((value as { cause?: unknown }).cause, depth + 1);
}

/**
 * Normalise any thrown value into an {@link AppError}.
 *
 * - Existing `AppError`s pass through unchanged.
 * - Postgres `23503` (foreign_key_violation), `23001` (restrict_violation), and
 *   `23505` (unique_violation) → `409 CONFLICT`. The SQLSTATE is located by
 *   walking the thrown value's `cause` chain, because Drizzle wraps the driver
 *   error (the code then lives on `.cause`, not top-level `.code`).
 * - Everything else → `500 INTERNAL_ERROR` with a generic message (the original
 *   is preserved as `cause` for logging, never leaked to the client).
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  const sqlState = pgSqlState(error);
  if (sqlState !== undefined && CONFLICT_SQLSTATES.has(sqlState)) {
    return new AppError("CONFLICT", "The request conflicts with existing data", {
      cause: error,
    });
  }

  return new AppError("INTERNAL_ERROR", "An unexpected error occurred", {
    cause: error,
  });
}

/**
 * Map any thrown value to `{ status, envelope }` ready to write to the wire.
 * Thin composition of {@link toAppError} + {@link AppError.toEnvelope}.
 */
export function toErrorResponse(error: unknown): {
  status: number;
  envelope: ErrorEnvelope;
} {
  const appError = toAppError(error);
  return { status: appError.status, envelope: appError.toEnvelope() };
}
