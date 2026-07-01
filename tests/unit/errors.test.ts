import { describe, expect, it } from "vitest";

import {
  AppError,
  conflictError,
  isAppError,
  toAppError,
  toErrorResponse,
  validationError,
} from "@/server/http/errors";

describe("AppError + status mapping", () => {
  it("maps each code to its standard HTTP status (plan §4.1)", () => {
    expect(new AppError("VALIDATION_ERROR", "x").status).toBe(400);
    expect(new AppError("UNAUTHENTICATED", "x").status).toBe(401);
    expect(new AppError("ACCOUNT_NOT_VERIFIED", "x").status).toBe(403);
    expect(new AppError("FORBIDDEN", "x").status).toBe(403);
    expect(new AppError("NOT_FOUND", "x").status).toBe(404);
    expect(new AppError("CONFLICT", "x").status).toBe(409);
    expect(new AppError("TOKEN_EXPIRED_OR_INVALID", "x").status).toBe(410);
    expect(new AppError("RATE_LIMITED", "x").status).toBe(429);
    expect(new AppError("INTERNAL_ERROR", "x").status).toBe(500);
  });

  it("builds the standard error envelope, including fields", () => {
    const err = validationError("Validation failed", { email: "Required" });
    expect(err.toEnvelope()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        fields: { email: "Required" },
      },
    });
  });

  it("omits fields from the envelope when absent", () => {
    expect(conflictError("dup").toEnvelope()).toEqual({
      error: { code: "CONFLICT", message: "dup" },
    });
  });

  it("isAppError narrows correctly", () => {
    expect(isAppError(new AppError("NOT_FOUND", "x"))).toBe(true);
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("nope")).toBe(false);
  });
});

describe("toAppError — Postgres SQLSTATE mapping", () => {
  it("maps 23503 (foreign_key_violation) to 409 CONFLICT", () => {
    const pgError = Object.assign(new Error("update or delete violates FK"), {
      code: "23503",
    });
    const mapped = toAppError(pgError);
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
    expect(mapped.cause).toBe(pgError);
  });

  it("maps 23505 (unique_violation) to 409 CONFLICT", () => {
    const pgError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    const mapped = toAppError(pgError);
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
  });

  it("passes AppError instances through unchanged", () => {
    const original = validationError("bad", { name: "Required" });
    expect(toAppError(original)).toBe(original);
  });

  it("maps unknown errors to 500 INTERNAL_ERROR without leaking details", () => {
    const mapped = toAppError(new Error("boom secret internals"));
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.status).toBe(500);
    expect(mapped.message).toBe("An unexpected error occurred");
  });

  it("maps other SQLSTATEs (e.g. 23514 check) to 500", () => {
    const pgError = Object.assign(new Error("check violation"), {
      code: "23514",
    });
    expect(toAppError(pgError).status).toBe(500);
  });
});

describe("toErrorResponse", () => {
  it("returns status + envelope for a thrown value", () => {
    const { status, envelope } = toErrorResponse(
      new AppError("NOT_FOUND", "missing"),
    );
    expect(status).toBe(404);
    expect(envelope).toEqual({
      error: { code: "NOT_FOUND", message: "missing" },
    });
  });
});
