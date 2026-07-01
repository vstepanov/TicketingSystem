import { describe, expect, it } from "vitest";

import {
  TOKEN_TTL_MS,
  computeExpiry,
  generateRawToken,
  hashToken,
  isExpired,
} from "@/server/services/token.service";

describe("token.service — raw token + hashing", () => {
  it("generates a URL-safe, high-entropy raw token", () => {
    const token = generateRawToken();
    // base64url alphabet only (no +, /, =).
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("generates distinct tokens each call", () => {
    expect(generateRawToken()).not.toBe(generateRawToken());
  });

  it("hashes deterministically and never returns the raw token", () => {
    const raw = generateRawToken();
    const h1 = hashToken(raw);
    const h2 = hashToken(raw);
    expect(h1).toBe(h2);
    // SHA-256 hex is 64 chars and must not equal / contain the raw token.
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(raw);
    expect(h1).not.toContain(raw);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken(generateRawToken())).not.toBe(
      hashToken(generateRawToken()),
    );
  });
});

describe("token.service — expiry math", () => {
  it("sets expiry exactly 24h after the reference time", () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const expiry = computeExpiry(from);
    expect(expiry.getTime() - from.getTime()).toBe(TOKEN_TTL_MS);
    expect(TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("treats a token as not expired before its expiry", () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const row = { expiresAt: computeExpiry(from) };
    const justBefore = new Date(from.getTime() + TOKEN_TTL_MS - 1000);
    expect(isExpired(row, justBefore)).toBe(false);
  });

  it("treats a token as expired at/after its expiry", () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const row = { expiresAt: computeExpiry(from) };
    expect(isExpired(row, row.expiresAt)).toBe(true);
    const later = new Date(row.expiresAt.getTime() + 1);
    expect(isExpired(row, later)).toBe(true);
  });
});
