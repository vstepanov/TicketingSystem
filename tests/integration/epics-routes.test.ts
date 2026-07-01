import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "epics-routes-secret-of-sufficient-length!!!!";
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
const listEpicsMock = vi.fn();
const createEpicMock = vi.fn();
const updateEpicMock = vi.fn();
const deleteEpicMock = vi.fn();
vi.mock("@/server/services/epic.service", () => ({
  listEpics: (...a: unknown[]) => listEpicsMock(...a),
  createEpic: (...a: unknown[]) => createEpicMock(...a),
  updateEpic: (...a: unknown[]) => updateEpicMock(...a),
  deleteEpic: (...a: unknown[]) => deleteEpicMock(...a),
}));

let collectionGET: typeof import("../../app/api/epics/route").GET;
let collectionPOST: typeof import("../../app/api/epics/route").POST;
let itemPATCH: typeof import("../../app/api/epics/[id]/route").PATCH;
let itemDELETE: typeof import("../../app/api/epics/[id]/route").DELETE;
let AppError: typeof import("@/server/http/errors").AppError;
let validationError: typeof import("@/server/http/errors").validationError;

const TEAM_ID = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  ({ GET: collectionGET, POST: collectionPOST } = await import(
    "../../app/api/epics/route"
  ));
  ({ PATCH: itemPATCH, DELETE: itemDELETE } = await import(
    "../../app/api/epics/[id]/route"
  ));
  ({ AppError, validationError } = await import("@/server/http/errors"));
});

afterEach(() => {
  authed = true;
  requireUserMock.mockClear();
  listEpicsMock.mockReset();
  createEpicMock.mockReset();
  updateEpicMock.mockReset();
  deleteEpicMock.mockReset();
});

const NOW_ISO = "2020-01-01T00:00:00.000Z";
const sampleEpic = {
  id: "e1",
  teamId: TEAM_ID,
  title: "Login flow",
  description: "details",
  createdAt: new Date(NOW_ISO),
  modifiedAt: new Date(NOW_ISO),
  ticketCount: 0,
  canDelete: true,
};

function getRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/epics (contract)", () => {
  it("200 array of epic objects with ISO timestamps + ticketCount/canDelete", async () => {
    listEpicsMock.mockResolvedValue([sampleEpic]);
    const res = await collectionGET(
      getRequest(`http://localhost/api/epics?teamId=${TEAM_ID}`) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: "e1",
        teamId: TEAM_ID,
        title: "Login flow",
        description: "details",
        createdAt: NOW_ISO,
        modifiedAt: NOW_ISO,
        ticketCount: 0,
        canDelete: true,
      },
    ]);
    // The route forwards the raw query value; the service validates it.
    expect(listEpicsMock).toHaveBeenCalledWith(TEAM_ID);
  });

  it("400 when teamId is missing (service raises VALIDATION_ERROR)", async () => {
    listEpicsMock.mockRejectedValue(
      validationError("A valid teamId is required"),
    );
    const res = await collectionGET(
      getRequest("http://localhost/api/epics") as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    // Missing param is forwarded as undefined.
    expect(listEpicsMock).toHaveBeenCalledWith(undefined);
  });

  it("401 when anonymous", async () => {
    authed = false;
    const res = await collectionGET(
      getRequest(`http://localhost/api/epics?teamId=${TEAM_ID}`) as never,
    );
    expect(res.status).toBe(401);
    expect(listEpicsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/epics (contract)", () => {
  it("201 epic object on success", async () => {
    createEpicMock.mockResolvedValue(sampleEpic);
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/epics", "POST", {
        teamId: TEAM_ID,
        title: "Login flow",
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("e1");
    expect(body.teamId).toBe(TEAM_ID);
    expect(body.canDelete).toBe(true);
    expect(body.createdAt).toBe(NOW_ISO);
  });

  it("400 on empty title (VALIDATION_ERROR envelope)", async () => {
    createEpicMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "Title is required", {
        fields: { title: "Title is required" },
      }),
    );
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/epics", "POST", {
        teamId: TEAM_ID,
        title: "",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("404 when the team does not exist", async () => {
    createEpicMock.mockRejectedValue(
      new AppError("NOT_FOUND", "Team not found"),
    );
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/epics", "POST", {
        teamId: TEAM_ID,
        title: "T",
      }) as never,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("401 when anonymous (before touching the service)", async () => {
    authed = false;
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/epics", "POST", {
        teamId: TEAM_ID,
        title: "T",
      }) as never,
    );
    expect(res.status).toBe(401);
    expect(createEpicMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/epics/{id} (contract)", () => {
  it("200 epic object on edit", async () => {
    updateEpicMock.mockResolvedValue({ ...sampleEpic, title: "Signup flow" });
    const res = await itemPATCH(
      jsonRequest("http://localhost/api/epics/e1", "PATCH", {
        title: "Signup flow",
      }) as never,
      ctxFor("e1"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Signup flow");
    expect(updateEpicMock).toHaveBeenCalledWith("e1", { title: "Signup flow" });
  });

  it("400 when the body carries a teamId (immutable team)", async () => {
    updateEpicMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "teamId is not editable"),
    );
    const res = await itemPATCH(
      jsonRequest("http://localhost/api/epics/e1", "PATCH", {
        teamId: "22222222-2222-2222-2222-222222222222",
        title: "X",
      }) as never,
      ctxFor("e1"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("404 for an unknown epic", async () => {
    updateEpicMock.mockRejectedValue(
      new AppError("NOT_FOUND", "Epic not found"),
    );
    const res = await itemPATCH(
      jsonRequest("http://localhost/api/epics/missing", "PATCH", {
        title: "X",
      }) as never,
      ctxFor("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("401 when anonymous", async () => {
    authed = false;
    const res = await itemPATCH(
      jsonRequest("http://localhost/api/epics/e1", "PATCH", {
        title: "X",
      }) as never,
      ctxFor("e1"),
    );
    expect(res.status).toBe(401);
    expect(updateEpicMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/epics/{id} (contract)", () => {
  it("204 on success", async () => {
    deleteEpicMock.mockResolvedValue(undefined);
    const res = await itemDELETE(
      new Request("http://localhost/api/epics/e1", {
        method: "DELETE",
      }) as never,
      ctxFor("e1"),
    );
    expect(res.status).toBe(204);
    expect(deleteEpicMock).toHaveBeenCalledWith("e1");
  });

  it("404 for an unknown epic", async () => {
    deleteEpicMock.mockRejectedValue(
      new AppError("NOT_FOUND", "Epic not found"),
    );
    const res = await itemDELETE(
      new Request("http://localhost/api/epics/missing", {
        method: "DELETE",
      }) as never,
      ctxFor("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("409 EPIC_REFERENCED when tickets reference the epic", async () => {
    deleteEpicMock.mockRejectedValue(
      new AppError(
        "CONFLICT",
        "Epic cannot be deleted while tickets reference it",
      ),
    );
    const res = await itemDELETE(
      new Request("http://localhost/api/epics/e1", {
        method: "DELETE",
      }) as never,
      ctxFor("e1"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });

  it("401 when anonymous", async () => {
    authed = false;
    const res = await itemDELETE(
      new Request("http://localhost/api/epics/e1", {
        method: "DELETE",
      }) as never,
      ctxFor("e1"),
    );
    expect(res.status).toBe(401);
    expect(deleteEpicMock).not.toHaveBeenCalled();
  });
});
