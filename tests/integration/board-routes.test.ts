import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "board-routes-secret-of-sufficient-length!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

// --- Mock the auth guard: toggle authenticated vs anonymous per test.
let authed = true;
const AUTH_USER = { id: "u1", email: "a@b.com", emailVerified: true };
const requireUserMock = vi.fn(async () => {
  if (!authed) {
    const { unauthenticatedError } = await import("@/server/http/errors");
    throw unauthenticatedError();
  }
  return AUTH_USER;
});
vi.mock("@/server/auth/guard", () => ({
  requireUser: () => requireUserMock(),
}));

// --- Mock the service layer (contract tests exercise only the HTTP boundary).
const getBoardMock = vi.fn();
vi.mock("@/server/services/board.service", () => ({
  getBoard: (...a: unknown[]) => getBoardMock(...a),
}));

let boardGET: typeof import("../../app/api/board/route").GET;
let AppError: typeof import("@/server/http/errors").AppError;

const TEAM_ID = "11111111-1111-1111-1111-111111111111";
const EPIC_ID = "22222222-2222-2222-2222-222222222222";
const NOW_ISO = "2020-01-01T00:00:00.000Z";

function emptyBoard() {
  return {
    teamId: TEAM_ID,
    total: 0,
    columns: {
      new: { count: 0, tickets: [] },
      ready_for_implementation: { count: 0, tickets: [] },
      in_progress: { count: 0, tickets: [] },
      ready_for_acceptance: { count: 0, tickets: [] },
      done: { count: 0, tickets: [] },
    },
  };
}

beforeAll(async () => {
  ({ GET: boardGET } = await import("../../app/api/board/route"));
  ({ AppError } = await import("@/server/http/errors"));
});

afterEach(() => {
  authed = true;
  requireUserMock.mockClear();
  getBoardMock.mockReset();
});

function get(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/board (contract, plan §4.8)", () => {
  it("200 with all five columns present even when empty", async () => {
    getBoardMock.mockResolvedValue(emptyBoard());
    const res = await boardGET(
      get(`http://localhost/api/board?teamId=${TEAM_ID}`) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.columns)).toEqual([
      "new",
      "ready_for_implementation",
      "in_progress",
      "ready_for_acceptance",
      "done",
    ]);
    expect(body.total).toBe(0);
    expect(body.teamId).toBe(TEAM_ID);
  });

  it("200 serializes card modifiedAt to ISO-8601 and passes filters to the service", async () => {
    getBoardMock.mockResolvedValue({
      teamId: TEAM_ID,
      total: 1,
      columns: {
        new: {
          count: 1,
          tickets: [
            {
              id: "t1",
              title: "Fix login",
              type: "bug",
              epicTitle: "Auth",
              modifiedAt: new Date(NOW_ISO),
            },
          ],
        },
        ready_for_implementation: { count: 0, tickets: [] },
        in_progress: { count: 0, tickets: [] },
        ready_for_acceptance: { count: 0, tickets: [] },
        done: { count: 0, tickets: [] },
      },
    });
    const res = await boardGET(
      get(
        `http://localhost/api/board?teamId=${TEAM_ID}&type=bug&epicId=${EPIC_ID}&q=login`,
      ) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.columns.new.tickets[0].modifiedAt).toBe(NOW_ISO);
    // The handler forwards the parsed query params to the service.
    expect(getBoardMock).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      type: "bug",
      epicId: EPIC_ID,
      q: "login",
    });
  });

  it("maps missing/undefined query params to undefined (not the string 'null')", async () => {
    getBoardMock.mockResolvedValue(emptyBoard());
    await boardGET(get(`http://localhost/api/board?teamId=${TEAM_ID}`) as never);
    expect(getBoardMock).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      type: undefined,
      epicId: undefined,
      q: undefined,
    });
  });

  it("400 when teamId is missing/invalid (VALIDATION_ERROR envelope)", async () => {
    getBoardMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "A valid teamId is required", {
        fields: { teamId: "A valid teamId is required" },
      }),
    );
    const res = await boardGET(get("http://localhost/api/board") as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("400 on a bad enum filter", async () => {
    getBoardMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "A valid type filter is required"),
    );
    const res = await boardGET(
      get(`http://localhost/api/board?teamId=${TEAM_ID}&type=task`) as never,
    );
    expect(res.status).toBe(400);
  });

  it("401 when anonymous (before touching the service)", async () => {
    authed = false;
    const res = await boardGET(
      get(`http://localhost/api/board?teamId=${TEAM_ID}`) as never,
    );
    expect(res.status).toBe(401);
    expect(getBoardMock).not.toHaveBeenCalled();
  });
});
