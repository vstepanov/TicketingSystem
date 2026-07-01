import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

/**
 * A complete, valid environment record used as a baseline. Individual tests
 * clone and mutate this to exercise specific validation rules.
 */
const validEnv: Record<string, string | undefined> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://app:secret@db:5432/ticketing",
  SESSION_SECRET: "x".repeat(32),
  APP_URL: "http://localhost:3000",
  SMTP_HOST: "relay1.dataart.com",
  SMTP_PORT: "587",
  SMTP_USER: "mailer",
  SMTP_PASS: "mailer-pass",
  SMTP_FROM: "Ticket Tracker <no-reply@dataart.com>",
};

describe("parseEnv", () => {
  it("parses a fully valid environment into a typed object", () => {
    const env = parseEnv(validEnv);

    expect(env.NODE_ENV).toBe("test");
    expect(env.DATABASE_URL).toBe("postgres://app:secret@db:5432/ticketing");
    expect(env.SESSION_SECRET).toHaveLength(32);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.SMTP_HOST).toBe("relay1.dataart.com");
    // SMTP_PORT is coerced from string to number.
    expect(env.SMTP_PORT).toBe(587);
    expect(typeof env.SMTP_PORT).toBe("number");
    expect(env.SMTP_FROM).toContain("no-reply@dataart.com");
  });

  it("applies defaults for NODE_ENV and SMTP_PORT", () => {
    const { NODE_ENV: _n, SMTP_PORT: _p, ...rest } = validEnv;
    void _n;
    void _p;

    const env = parseEnv(rest);

    expect(env.NODE_ENV).toBe("development");
    expect(env.SMTP_PORT).toBe(587);
  });

  it("treats SMTP_USER and SMTP_PASS as optional", () => {
    const { SMTP_USER: _u, SMTP_PASS: _pw, ...rest } = validEnv;
    void _u;
    void _pw;

    const env = parseEnv(rest);

    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASS).toBeUndefined();
  });

  it("throws when a required variable is missing", () => {
    const { DATABASE_URL: _d, ...rest } = validEnv;
    void _d;

    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when SESSION_SECRET is too short", () => {
    expect(() =>
      parseEnv({ ...validEnv, SESSION_SECRET: "too-short" }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("throws when DATABASE_URL is not a valid URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, DATABASE_URL: "not-a-url" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("throws on an out-of-range SMTP_PORT", () => {
    expect(() => parseEnv({ ...validEnv, SMTP_PORT: "70000" })).toThrow(
      /SMTP_PORT/,
    );
  });

  it("aggregates multiple validation errors into one message", () => {
    expect(() =>
      parseEnv({ NODE_ENV: "production" }),
    ).toThrow(/Invalid environment configuration/);
  });
});
