// Placeholder test file. A scratch probe once lived here; the FUSE test mount
// disallows file deletion, so it is kept as a harmless no-op instead.
import { describe, expect, it } from "vitest";

describe("_probe placeholder", () => {
  it("is a no-op", () => {
    expect(true).toBe(true);
  });
});
