import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "teams-routes-secret-of-sufficient-length!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

// --- Mock the auth guard: toggle authenticated vs anonymous per test.
let authed = true;
const requireUserMock = vi.fn(async (): Promise<{
  id: string;
  email: string;
  emailVerified: boolean;
}> => {
  if (!authed) {
    const { unauthenticatedError } = await import("@/server/http/errors");
    throw unauthenticatedError();
  }
  return { id: "u1", email: "a@b.com", emailVerified: true };
});
vi.mock("@/server/auth/guard", () => ({
  requireUser: () => requireUserMock(),
}));

// --- Mock the service layer (contract tests exercise only the HTTP boundary).
const listTeamsMock = vi.fn();
const createTeamMock = vi.fn();
const renameTeamMock = vi.fn();
const deleteTeamMock = vi.fn();
vi.mock("@/server/services/team.service", () => ({
  listTeams: (...a: unknown[]) => listTeamsMock(...a),
  createTeam: (...a: unknown[]) => createTeamMock(...a),
  renameTeam: (...a: unknown[]) => renameTeamMock(...a),
  deleteTeam: (...a: unknown[]) => deleteTeamMock(...a),
}));

let collectionGET: typeof import("../../app/api/teams/route").GET;
let collectionPOST: typeof import("../../app/api/teams/route").POST;
let itemPATCH: typeof import("../../app/api/teams/[id]/route").PATCH;
let itemDELETE: typeof import("../../app/api/teams/[id]/route").DELETE;
let AppError: typeof import("@/server/http/errors").AppError;

beforeAll(async () => {
  ({ GET: collectionGET, POST: collectionPOST } = await import(
    "../../app/api/teams/route"
  ));
  ({ PATCH: itemPATCH, DELETE: itemDELETE } = await import(
    "../../app/api/teams/[id]/route"
  ));
  ({ AppError } = await import("@/server/http/errors"));
});

afterEach(() => {
  authed = true;
  requireUserMock.mockClear();
  listTeamsMock.mockReset();
  createTeamMock.mockReset();
  renameTeamMock.mockReset();
  deleteTeamMock.mockReset();
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const NOW_ISO = "2020-01-01T00:00:00.000Z";
const sampleTeam = {
  id: "t1",
  name: "Payments",
  createdAt: new Date(NOW_ISO),
  modifiedAt: new Date(NOW_ISO),
  ticketCount: 0,
  epicCount: 0,
  canDelete: true,
};

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/teams (contract)", () => {
  it("200 array of team objects with ISO timestamps", async () => {
    listTeamsMock.mockResolvedValue([sampleTeam]);
    const res = await collectionGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: "t1",
        name: "Payments",
        createdAt: NOW_ISO,
        modifiedAt: NOW_ISO,
        ticketCount: 0,
        epicCount: 0,
        canDelete: true,
      },
    ]);
  });

  it("401 when anonymous", async () => {
    authed = false;
    const res = await collectionGET();
    expect(res.status).toBe(401);
    expect(listTeamsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/teams (contract)", () => {
  it("201 team object on success", async () => {
    createTeamMock.mockResolvedValue(sampleTeam);
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/teams", { name: "Payments" }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("t1");
    expect(body.canDelete).toBe(true);
    expect(body.createdAt).toBe(NOW_ISO);
  });

  it("400 on empty name (VALIDATION_ERROR envelope)", async () => {
    createTeamMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "Team name is required", {
        fields: { name: "Team name is required" },
      }),
    );
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/teams", { name: "" }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("409 on duplicate name", async () => {
    createTeamMock.mockRejectedValue(new AppError("CONFLICT", "dup"));
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/teams", { name: "Payments" }) as never,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });

  it("401 when anonymous (before touching the service)", async () => {
    authed = false;
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/teams", { name: "Payments" }) as never,
    );
    expect(res.status).toBe(401);
    expect(createTeamMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/teams/{id} (contract)", () => {
  it("200 team object on rename", async () => {
    renameTeamMock.mockResolvedValue({ ...sampleTeam, name: "Billing" });
    const req = new Request("http://localhost/api/teams/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Billing" }),
    });
    const res = await itemPATCH(req as never, ctxFor("t1"));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Billing");
    expect(renameTeamMock).toHaveBeenCalledWith("t1", { name: "Billing" });
  });

  it("404 for an unknown team", async () => {
    renameTeamMock.mockRejectedValue(new AppError("NOT_FOUND", "Team not found"));
    const req = new Request("http://localhost/api/teams/missing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    const res = await itemPATCH(req as never, ctxFor("missing"));
    expect(res.status).toBe(404);
  });

  it("409 on rename collision", async () => {
    renameTeamMock.mockRejectedValue(new AppError("CONFLICT", "dup"));
    const req = new Request("http://localhost/api/teams/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Taken" }),
    });
    const res = await itemPATCH(req as never, ctxFor("t1"));
    expect(res.status).toBe(409);
  });

  it("401 when anonymous", async () => {
    authed = false;
    const req = new Request("http://localhost/api/teams/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    const res = await itemPATCH(req as never, ctxFor("t1"));
    expect(res.status).toBe(401);
    expect(renameTeamMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/teams/{id} (contract)", () => {
  it("204 on success", async () => {
    deleteTeamMock.mockResolvedValue(undefined);
    const res = await itemDELETE(
      new Request("http://localhost/api/teams/t1", { method: "DELETE" }) as never,
      ctxFor("t1"),
    );
    expect(res.status).toBe(204);
    expect(deleteTeamMock).toHaveBeenCalledWith("t1");
  });

  it("404 for an unknown team", async () => {
    deleteTeamMock.mockRejectedValue(new AppError("NOT_FOUND", "Team not found"));
    const res = await itemDELETE(
      new Request("http://localhost/api/teams/missing", {
        method: "DELETE",
      }) as never,
      ctxFor("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("409 TEAM_NOT_EMPTY when the team has tickets or epics", async () => {
    deleteTeamMock.mockRejectedValue(
      new AppError("CONFLICT", "Team cannot be deleted while it still has tickets or epics"),
    );
    const res = await itemDELETE(
      new Request("http://localhost/api/teams/t1", { method: "DELETE" }) as never,
      ctxFor("t1"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });

  it("401 when anonymous", async () => {
    authed = false;
    const res = await itemDELETE(
      new Request("http://localhost/api/teams/t1", { method: "DELETE" }) as never,
      ctxFor("t1"),
    );
    expect(res.status).toBe(401);
    expect(deleteTeamMock).not.toHaveBeenCalled();
  });
});
