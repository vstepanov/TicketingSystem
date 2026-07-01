import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "auth-routes-secret-of-sufficient-length!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

// --- Mock the service layer (contract tests exercise only the HTTP boundary).
const loginMock = vi.fn();
const verifyEmailMock = vi.fn();
const resendVerificationMock = vi.fn();
vi.mock("@/server/services/auth.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/services/auth.service")>();
  return {
    ...actual, // keep the real Zod schemas the routes import
    login: (...args: unknown[]) => loginMock(...args),
    verifyEmail: (...args: unknown[]) => verifyEmailMock(...args),
    resendVerification: (...args: unknown[]) => resendVerificationMock(...args),
  };
});

// --- Mock the cookie store so we can observe session set/clear + drive reads.
interface CookieCall {
  name: string;
  value: string;
  options: { maxAge?: number };
}
const cookieSets: CookieCall[] = [];
let sessionCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" && sessionCookieValue !== undefined
        ? { name, value: sessionCookieValue }
        : undefined,
    set: (name: string, value: string, options: { maxAge?: number }) => {
      cookieSets.push({ name, value, options });
    },
  }),
}));

// --- Mock the DB client used by /me (avoid a real DB for the contract test).
const meSelectRows: Array<{ id: string; email: string; emailVerified: boolean }> =
  [];
vi.mock("@/server/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => meSelectRows,
        }),
      }),
    }),
  },
}));

let loginPOST: typeof import("../../app/api/auth/login/route").POST;
let verifyPOST: typeof import("../../app/api/auth/verify/route").POST;
let logoutPOST: typeof import("../../app/api/auth/logout/route").POST;
let mePOST: typeof import("../../app/api/auth/me/route").GET;
let resendPOST: typeof import("../../app/api/auth/resend-verification/route").POST;
let createSessionToken: typeof import("@/server/auth/session").createSessionToken;
let resetRateLimiter: typeof import("@/server/auth/rate-limit").resetRateLimiter;
let AppError: typeof import("@/server/http/errors").AppError;

beforeAll(async () => {
  ({ POST: loginPOST } = await import("../../app/api/auth/login/route"));
  ({ POST: verifyPOST } = await import("../../app/api/auth/verify/route"));
  ({ POST: logoutPOST } = await import("../../app/api/auth/logout/route"));
  ({ GET: mePOST } = await import("../../app/api/auth/me/route"));
  ({ POST: resendPOST } = await import(
    "../../app/api/auth/resend-verification/route"
  ));
  ({ createSessionToken } = await import("@/server/auth/session"));
  ({ resetRateLimiter } = await import("@/server/auth/rate-limit"));
  ({ AppError } = await import("@/server/http/errors"));
});

afterEach(() => {
  loginMock.mockReset();
  verifyEmailMock.mockReset();
  resendVerificationMock.mockReset();
  cookieSets.length = 0;
  meSelectRows.length = 0;
  sessionCookieValue = undefined;
  resetRateLimiter();
});

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login (contract)", () => {
  it("200 with { id, email } and sets the session cookie on success", async () => {
    loginMock.mockResolvedValue({ id: "u1", email: "a@b.com" });
    const res = await loginPOST(
      jsonRequest("http://localhost/api/auth/login", {
        email: "a@b.com",
        password: "supersecret",
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "u1", email: "a@b.com" });
    // Session cookie was set with a positive maxAge (login, not clear).
    const set = cookieSets.find((c) => c.name === "session");
    expect(set).toBeDefined();
    expect(set!.value.length).toBeGreaterThan(0);
    expect(set!.options.maxAge).toBeGreaterThan(0);
  });

  it("401 (generic) does not set a cookie", async () => {
    loginMock.mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Invalid email or password"),
    );
    const res = await loginPOST(
      jsonRequest("http://localhost/api/auth/login", {
        email: "a@b.com",
        password: "x",
      }) as never,
    );
    expect(res.status).toBe(401);
    expect(cookieSets.find((c) => c.name === "session")).toBeUndefined();
  });

  it("403 ACCOUNT_NOT_VERIFIED envelope", async () => {
    loginMock.mockRejectedValue(
      new AppError("ACCOUNT_NOT_VERIFIED", "Account email is not verified"),
    );
    const res = await loginPOST(
      jsonRequest("http://localhost/api/auth/login", {
        email: "a@b.com",
        password: "supersecret",
      }) as never,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("ACCOUNT_NOT_VERIFIED");
  });
});

describe("POST /api/auth/verify (contract)", () => {
  it("200 { verified: true } on success", async () => {
    verifyEmailMock.mockResolvedValue({ verified: true });
    const res = await verifyPOST(
      jsonRequest("http://localhost/api/auth/verify", { token: "raw" }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true });
  });

  it("410 TOKEN_EXPIRED_OR_INVALID envelope", async () => {
    verifyEmailMock.mockRejectedValue(
      new AppError("TOKEN_EXPIRED_OR_INVALID", "Expired or invalid link"),
    );
    const res = await verifyPOST(
      jsonRequest("http://localhost/api/auth/verify", { token: "raw" }) as never,
    );
    expect(res.status).toBe(410);
    expect((await res.json()).error.code).toBe("TOKEN_EXPIRED_OR_INVALID");
  });
});

describe("POST /api/auth/resend-verification (contract)", () => {
  it("always returns generic 200 { ok: true }", async () => {
    resendVerificationMock.mockResolvedValue({ sent: false });
    const res = await resendPOST(
      jsonRequest("http://localhost/api/auth/resend-verification", {
        email: "a@b.com",
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("400 for a malformed email (before rate limit)", async () => {
    const res = await resendPOST(
      jsonRequest("http://localhost/api/auth/resend-verification", {
        email: "bad",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(resendVerificationMock).not.toHaveBeenCalled();
  });

  it("429 once the per-key limit is exceeded", async () => {
    resendVerificationMock.mockResolvedValue({ sent: false });
    const body = { email: "flood@b.com" };
    const headers = { "x-forwarded-for": "9.9.9.9" };
    // Limit is 3 per window: first three ok, fourth 429.
    for (let i = 0; i < 3; i += 1) {
      const ok = await resendPOST(
        jsonRequest("http://localhost/api/auth/resend-verification", body, headers) as never,
      );
      expect(ok.status).toBe(200);
    }
    const limited = await resendPOST(
      jsonRequest("http://localhost/api/auth/resend-verification", body, headers) as never,
    );
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe("RATE_LIMITED");
  });
});

describe("POST /api/auth/logout (contract)", () => {
  it("204 and clears the cookie when a session exists", async () => {
    sessionCookieValue = createSessionToken("u1");
    const res = await logoutPOST();
    expect(res.status).toBe(204);
    const cleared = cookieSets.find((c) => c.name === "session");
    expect(cleared).toBeDefined();
    expect(cleared!.value).toBe("");
    expect(cleared!.options.maxAge).toBe(0);
  });

  it("401 when there is no session", async () => {
    sessionCookieValue = undefined;
    const res = await logoutPOST();
    expect(res.status).toBe(401);
    expect(cookieSets.find((c) => c.name === "session")).toBeUndefined();
  });
});

describe("GET /api/auth/me (contract)", () => {
  it("200 { id, email, emailVerified } for a valid session", async () => {
    sessionCookieValue = createSessionToken("u1");
    meSelectRows.push({ id: "u1", email: "a@b.com", emailVerified: true });
    const res = await mePOST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "u1",
      email: "a@b.com",
      emailVerified: true,
    });
  });

  it("401 when there is no session", async () => {
    sessionCookieValue = undefined;
    const res = await mePOST();
    expect(res.status).toBe(401);
  });

  it("401 when the session references a missing user", async () => {
    sessionCookieValue = createSessionToken("ghost");
    // meSelectRows is empty → user not found.
    const res = await mePOST();
    expect(res.status).toBe(401);
  });
});
