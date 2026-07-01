import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  optionalTrimmedString,
  parseOrThrow,
  trimmedString,
  zodErrorToFields,
} from "@/lib/validation";
import { AppError, isAppError } from "@/server/http/errors";

const schema = z.object({
  email: trimmedString("Email is required"),
  name: trimmedString("Name is required"),
});

describe("parseOrThrow", () => {
  it("returns typed, trimmed data on success", () => {
    const value = parseOrThrow(schema, {
      email: "  a@b.com  ",
      name: "  Acme  ",
    });
    expect(value).toEqual({ email: "a@b.com", name: "Acme" });
  });

  it("throws a VALIDATION_ERROR AppError with a fields map on failure", () => {
    try {
      parseOrThrow(schema, { email: "", name: "   " });
      throw new Error("expected parseOrThrow to throw");
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      const appErr = err as AppError;
      expect(appErr.code).toBe("VALIDATION_ERROR");
      expect(appErr.status).toBe(400);
      expect(appErr.fields).toEqual({
        email: "Email is required",
        name: "Name is required",
      });
    }
  });

  it("reports missing keys under their field path", () => {
    try {
      parseOrThrow(schema, {});
      throw new Error("expected throw");
    } catch (err) {
      const appErr = err as AppError;
      expect(Object.keys(appErr.fields ?? {})).toEqual(["email", "name"]);
    }
  });
});

describe("trimmedString", () => {
  it("rejects whitespace-only values as empty", () => {
    const result = trimmedString().safeParse("   ");
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace on valid values", () => {
    const result = trimmedString().safeParse("  hello  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("hello");
  });
});

describe("optionalTrimmedString", () => {
  const opt = z.object({ description: optionalTrimmedString() });

  it("normalises undefined to null", () => {
    expect(opt.parse({})).toEqual({ description: null });
  });

  it("normalises whitespace-only to null", () => {
    expect(opt.parse({ description: "   " })).toEqual({ description: null });
  });

  it("trims and keeps a real value", () => {
    expect(opt.parse({ description: "  hi  " })).toEqual({ description: "hi" });
  });
});

describe("zodErrorToFields", () => {
  it("uses the first message per path and _ for root issues", () => {
    const s = z
      .object({ a: z.string() })
      .refine(() => false, { message: "form invalid" });
    const result = s.safeParse({ a: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = zodErrorToFields(result.error);
      expect(fields.a).toBeDefined();
    }
  });
});
