import { describe, expect, it } from "vitest";

import { RateLimiter } from "@/server/auth/rate-limit";

describe("RateLimiter (fixed window)", () => {
  it("allows up to the limit then blocks within the window", () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 1000 });
    const now = 0;
    expect(rl.hit("a", now)).toEqual({ allowed: true, remaining: 2 });
    expect(rl.hit("a", now)).toEqual({ allowed: true, remaining: 1 });
    expect(rl.hit("a", now)).toEqual({ allowed: true, remaining: 0 });
    expect(rl.hit("a", now)).toEqual({ allowed: false, remaining: 0 });
  });

  it("resets the budget once the window elapses", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("a", 500).allowed).toBe(false);
    // At exactly windowMs the window resets.
    expect(rl.hit("a", 1000).allowed).toBe(true);
    expect(rl.hit("a", 1500).allowed).toBe(false);
  });

  it("tracks keys independently", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("b", 0).allowed).toBe(true);
    expect(rl.hit("a", 0).allowed).toBe(false);
    expect(rl.hit("b", 0).allowed).toBe(false);
  });

  it("reset() clears all recorded windows", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("a", 0).allowed).toBe(false);
    rl.reset();
    expect(rl.hit("a", 0).allowed).toBe(true);
  });
});
