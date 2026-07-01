import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The route reads the typed `env` on import (via the service graph); provide a
// full valid env before importing anything that touches it.
process.env.SESSION_SECRET ??= "signup-route-secret-of-sufficient-length!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

// Mock the service so the contract test exercises only the HTTP boundary
// (envelope shape + status codes), not the DB.
const signupMock = vi.fn();
vi.mock("@/server/services/auth.service", () => ({
  signup: (...args: unknown[]) => signupMock(...args),
}));

let POST: typeof import("../../app/api/auth/signup/route").POST;

beforeAll(async () => {
  ({ POST } = await import("../../app/api/auth/signup/route"));
});

afterEach(() => {
  signupMock.mockReset();
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup (contract)", () => {
  it("returns 201 with { id, email, emailVerified: false } and no internal fields", async () => {
    signupMock.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      email: "user@example.com",
      emailVerified: false,
      mailSent: true,
    });

    const res = await POST(makeRequest({
      email: "user@example.com",
      password: "supersecret",
      confirmPassword: "supersecret",
    }) as never);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "user@example.com",
      emailVerified: false,
    });
    // Internal delivery flag must not leak to the client.
    expect(json).not.toHaveProperty("mailSent");
  });

  it("propagates a 400 validation error envelope", async () => {
    const { AppError } = await import("@/server/http/errors");
    signupMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "Validation failed", {
        fields: { email: "Enter a valid email address" },
      }),
    );

    const res = await POST(makeRequest({ email: "bad" }) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.fields.email).toBeDefined();
  });

  it("propagates a 409 conflict envelope for duplicate email", async () => {
    const { AppError } = await import("@/server/http/errors");
    signupMock.mockRejectedValue(
      new AppError("CONFLICT", "Could not complete sign up"),
    );

    const res = await POST(makeRequest({
      email: "dup@example.com",
      password: "supersecret",
      confirmPassword: "supersecret",
    }) as never);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const badReq = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(badReq as never);
    expect(res.status).toBe(400);
    expect(signupMock).not.toHaveBeenCalled();
  });
});
