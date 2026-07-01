/**
 * GET /api/ready contract test (plan §4.9, step S13).
 *
 * Exercises the HTTP boundary of the readiness route by mocking the injectable
 * db-readiness check, so both branches are asserted deterministically without a
 * live database:
 *   - ready → 200 { status: "ready" }
 *   - not ready (simulated DB down) → 503 { status: "not_ready" }
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.SESSION_SECRET ??= "ready-route-secret-of-sufficient-length!!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

const checkDbReadinessMock = vi.fn();
vi.mock("@/server/db/readiness", () => ({
  checkDbReadiness: (...args: unknown[]) => checkDbReadinessMock(...args),
}));

let readyGET: typeof import("../../app/api/ready/route").GET;

beforeAll(async () => {
  ({ GET: readyGET } = await import("../../app/api/ready/route"));
});

afterEach(() => {
  checkDbReadinessMock.mockReset();
});

describe("GET /api/ready (contract)", () => {
  it("200 { status: 'ready' } when the DB check succeeds", async () => {
    checkDbReadinessMock.mockResolvedValue({ ready: true });
    const res = await readyGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("503 { status: 'not_ready' } when the DB is down", async () => {
    checkDbReadinessMock.mockResolvedValue({ ready: false });
    const res = await readyGET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "not_ready" });
  });
});
