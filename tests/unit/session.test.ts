import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  verifySessionToken,
} from "@/server/auth/session";

const SECRET = "unit-test-session-secret-of-sufficient-length";
const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("session token sign/verify", () => {
  it("round-trips a valid token back to its payload", () => {
    const token = createSessionToken(USER_ID, SECRET);
    const payload = verifySessionToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(USER_ID);
    expect(payload?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("never embeds the raw payload without a signature separator", () => {
    const token = createSessionToken(USER_ID, SECRET);
    expect(token.split(".")).toHaveLength(2);
  });

  it("rejects a token signed with a different secret (tamper via key)", () => {
    const token = createSessionToken(USER_ID, SECRET);
    expect(verifySessionToken(token, "a-completely-different-secret")).toBeNull();
  });

  it("rejects a token whose payload was tampered (id swap)", () => {
    const token = createSessionToken(USER_ID, SECRET);
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        uid: "22222222-2222-2222-2222-222222222222",
        exp: Math.floor(Date.now() / 1000) + 1000,
      }),
    ).toString("base64url");
    const forged = `${forgedPayload}.${signature}`;
    expect(verifySessionToken(forged, SECRET)).toBeNull();
  });

  it("rejects a token whose signature was mutated", () => {
    const token = createSessionToken(USER_ID, SECRET);
    const [payload, signature] = token.split(".");
    const flipped =
      signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(verifySessionToken(`${payload}.${flipped}`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = createSessionToken(USER_ID, SECRET, -10);
    expect(verifySessionToken(expired, SECRET)).toBeNull();
  });

  it("rejects empty / malformed tokens", () => {
    expect(verifySessionToken(undefined, SECRET)).toBeNull();
    expect(verifySessionToken(null, SECRET)).toBeNull();
    expect(verifySessionToken("", SECRET)).toBeNull();
    expect(verifySessionToken("no-dot-here", SECRET)).toBeNull();
    expect(verifySessionToken(".onlysig", SECRET)).toBeNull();
    expect(verifySessionToken("onlypayload.", SECRET)).toBeNull();
  });
});
