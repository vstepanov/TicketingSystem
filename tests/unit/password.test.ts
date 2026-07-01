import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing (Argon2id)", () => {
  it("hashes to an Argon2id encoded string, not the plaintext", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toBe("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("s3cret-password");
    await expect(verifyPassword(hash, "s3cret-password")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-password");
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("produces distinct hashes for the same password (random salt)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    await expect(verifyPassword(a, "same-password")).resolves.toBe(true);
    await expect(verifyPassword(b, "same-password")).resolves.toBe(true);
  });

  it("returns false (does not throw) for a malformed stored hash", async () => {
    await expect(verifyPassword("not-a-real-hash", "whatever")).resolves.toBe(
      false,
    );
  });
});
