/**
 * Typed API client (plan §5, §4.1).
 *
 * A thin `fetch` wrapper that all SPA data access goes through. It:
 *   - always sends the session cookie (`credentials: "include"`);
 *   - sends/receives JSON;
 *   - parses the standard error envelope `{ error: { code, message, fields } }`
 *     and throws a typed {@link ApiError} carrying `status`, `code`, `message`,
 *     and optional per-field messages;
 *   - runs a pluggable global 401 handler so any unauthenticated response
 *     redirects the user to `/login` (registered by the app shell).
 *
 * The client never reads/writes `localStorage` — the session lives entirely in
 * the HttpOnly cookie (plan §2.1). This file is framework-agnostic: it does not
 * import `next/navigation`, so the redirect behaviour is injected via
 * {@link setUnauthorizedHandler}. That keeps it unit-testable and avoids
 * coupling the transport layer to the router.
 */

/** Machine-readable error codes mirrored from the backend (plan §4.1). */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "ACCOUNT_NOT_VERIFIED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOKEN_EXPIRED_OR_INVALID"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** Per-field validation messages: `path -> human message`. */
export type ApiFieldErrors = Record<string, string>;

/** The serialized error envelope body (plan §4.1). */
interface ErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: ApiFieldErrors;
  };
}

/**
 * Typed error thrown for any non-2xx response. Carries the HTTP status, the
 * parsed error `code`/`message`, and optional field-level messages so screens
 * can render inline validation and key behaviour off `code`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: ApiFieldErrors;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: ApiFieldErrors,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** Type guard for {@link ApiError}. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Handler invoked whenever a request returns 401 (anonymous). */
type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Register the global 401 handler. The app shell wires this to a router
 * redirect (`/login`). Pass `null` to clear it (e.g. in tests).
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** Options for {@link apiFetch}. Mirrors a subset of `RequestInit`. */
export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON-serializable request body (sent as `application/json`). */
  body?: unknown;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

async function parseEnvelope(response: Response): Promise<ErrorEnvelope | null> {
  try {
    const data = (await response.json()) as unknown;
    if (
      data !== null &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as ErrorEnvelope).error === "object"
    ) {
      return data as ErrorEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Core request function. Resolves with the parsed JSON body typed as `T` for
 * 2xx responses (or `undefined` for `204 No Content`); throws {@link ApiError}
 * otherwise. On 401 the registered unauthorized handler fires before the error
 * is thrown so the caller's redirect wins over any local error handling.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers, signal } = options;

  const init: RequestInit = {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  };

  const response = await fetch(path, init);

  if (response.status === 401) {
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
    const envelope = await parseEnvelope(response);
    throw new ApiError(
      401,
      envelope?.error.code ?? "UNAUTHENTICATED",
      envelope?.error.message ?? "Authentication required",
      envelope?.error.fields,
    );
  }

  if (!response.ok) {
    const envelope = await parseEnvelope(response);
    throw new ApiError(
      response.status,
      envelope?.error.code ?? "INTERNAL_ERROR",
      envelope?.error.message ?? "Request failed",
      envelope?.error.fields,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** Convenience helpers keyed by HTTP method. */
export const api = {
  get: <T = unknown>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T = unknown>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};
