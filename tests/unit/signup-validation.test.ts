import { describe, expect, it } from "vitest";

import { signupSchema } from "@/server/services/auth.service";
import { renderVerificationEmail } from "@/server/services/email-templates";

/** Parse helper returning the flat field-error map (or null on success). */
function fieldsFor(input: unknown): Record<string, string> | null {
  const result = signupSchema.safeParse(input);
  if (result.success) return null;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

const VALID = {
  email: "User@Example.com",
  password: "supersecret",
  confirmPassword: "supersecret",
};

describe("signupSchema — email normalisation", () => {
  it("trims and lowercases the email", () => {
    const parsed = signupSchema.parse({
      ...VALID,
      email: "  User@Example.COM  ",
    });
    expect(parsed.email).toBe("user@example.com");
  });

  it("rejects a malformed email", () => {
    const fields = fieldsFor({ ...VALID, email: "not-an-email" });
    expect(fields?.email).toBeDefined();
  });

  it("rejects a missing email", () => {
    const fields = fieldsFor({ password: "supersecret", confirmPassword: "supersecret" });
    expect(fields?.email).toBeDefined();
  });
});

describe("signupSchema — password rule", () => {
  it("accepts a password of exactly 8 characters", () => {
    const parsed = signupSchema.parse({
      ...VALID,
      password: "12345678",
      confirmPassword: "12345678",
    });
    expect(parsed.password).toBe("12345678");
  });

  it("rejects a password shorter than 8 characters", () => {
    const fields = fieldsFor({
      ...VALID,
      password: "short",
      confirmPassword: "short",
    });
    expect(fields?.password).toBeDefined();
  });

  it("rejects when confirmPassword does not match", () => {
    const fields = fieldsFor({ ...VALID, confirmPassword: "different" });
    expect(fields?.confirmPassword).toBeDefined();
  });
});

describe("verification email template", () => {
  it("embeds the verification link in both text and HTML bodies", () => {
    const link = "http://localhost:3000/verify?token=abc123";
    const { subject, text, html } = renderVerificationEmail(link);
    expect(subject.length).toBeGreaterThan(0);
    expect(text).toContain(link);
    expect(html).toContain(link);
  });
});
