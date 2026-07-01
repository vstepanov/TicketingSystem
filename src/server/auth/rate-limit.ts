/**
 * Minimal in-memory fixed-window rate limiter (plan §4.3, §5 security).
 *
 * Used to throttle abuse-prone public endpoints — currently
 * `resend-verification`, which could otherwise be used to spam a victim's inbox
 * or to probe for accounts. A single-process, in-memory limiter is sufficient
 * for the hackathon deployment (one `web` container); a distributed store would
 * be the production upgrade path, but that is explicitly out of scope.
 *
 * The limiter is a fixed-window counter keyed by an arbitrary string (the caller
 * chooses email and/or client IP). Each key gets `limit` hits per `windowMs`;
 * the window resets lazily on the first hit after it elapses. State lives in a
 * module-level `Map`, so it is shared across requests but reset when the process
 * restarts (and can be cleared in tests via {@link resetRateLimiter}).
 */

/** Result of a rate-limit check. */
export interface RateLimitResult {
  /** Whether this hit is allowed (within the window's budget). */
  allowed: boolean;
  /** Remaining hits in the current window after this call (never negative). */
  remaining: number;
}

interface WindowState {
  /** Hits recorded in the current window. */
  count: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
}

/** Options for {@link RateLimiter}. */
export interface RateLimiterOptions {
  /** Max hits allowed per key within a window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * A fixed-window rate limiter over an in-memory map. Instantiable so different
 * endpoints can have independent budgets and, in tests, isolated instances.
 */
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, WindowState>();

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
  }

  /**
   * Record a hit for `key` and report whether it is allowed. Callers should
   * invoke this once per request and reject with 429 when `allowed` is false.
   */
  hit(key: string, now: number = Date.now()): RateLimitResult {
    const existing = this.windows.get(key);

    if (existing === undefined || now >= existing.resetAt) {
      // Start a fresh window; this hit is the first of it.
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1 };
    }

    if (existing.count >= this.limit) {
      return { allowed: false, remaining: 0 };
    }

    existing.count += 1;
    return { allowed: true, remaining: this.limit - existing.count };
  }

  /** Clear all recorded windows (test hook). */
  reset(): void {
    this.windows.clear();
  }
}

/**
 * Shared limiter for the resend-verification endpoint: at most
 * {@link RESEND_LIMIT} attempts per key per {@link RESEND_WINDOW_MS}. The key is
 * the normalized email plus the client IP so neither a single account nor a
 * single origin can be flooded.
 */
export const RESEND_LIMIT = 3;
export const RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export const resendRateLimiter = new RateLimiter({
  limit: RESEND_LIMIT,
  windowMs: RESEND_WINDOW_MS,
});

/** Clear the shared resend limiter (used between tests). */
export function resetRateLimiter(): void {
  resendRateLimiter.reset();
}
