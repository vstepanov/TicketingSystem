import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "tickets-routes-secret-of-sufficient-length!!!";
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
const createTicketMock = vi.fn();
const getTicketMock = vi.fn();
const updateTicketMock = vi.fn();
const updateTicketStateMock = vi.fn();
const deleteTicketMock = vi.fn();
vi.mock("@/server/services/ticket.service", () => ({
  createTicket: (...a: unknown[]) => createTicketMock(...a),
  getTicket: (...a: unknown[]) => getTicketMock(...a),
  updateTicket: (...a: unknown[]) => updateTicketMock(...a),
  updateTicketState: (...a: unknown[]) => updateTicketStateMock(...a),
  deleteTicket: (...a: unknown[]) => deleteTicketMock(...a),
}));

let collectionPOST: typeof import("../../app/api/tickets/route").POST;
let itemGET: typeof import("../../app/api/tickets/[id]/route").GET;
let itemPATCH: typeof import("../../app/api/tickets/[id]/route").PATCH;
let itemDELETE: typeof import("../../app/api/tickets/[id]/route").DELETE;
let statePATCH: typeof import("../../app/api/tickets/[id]/state/route").PATCH;
let AppError: typeof import("@/server/http/errors").AppError;

const TEAM_ID = "11111111-1111-1111-1111-111111111111";
const TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW_ISO = "2020-01-01T00:00:00.000Z";

const sampleTicket = {
  id: TICKET_ID,
  teamId: TEAM_ID,
  epicId: null,
  type: "bug",
  state: "new",
  title: "Fix",
  body: "Broken",
  createdBy: "u1",
  createdAt: new Date(NOW_ISO),
  modifiedAt: new Date(NOW_ISO),
};

beforeAll(async () => {
  ({ POST: collectionPOST } = await import("../../app/api/tickets/route"));
  ({
    GET: itemGET,
    PATCH: itemPATCH,
    DELETE: itemDELETE,
  } = await import("../../app/api/tickets/[id]/route"));
  ({ PATCH: statePATCH } = await import(
    "../../app/api/tickets/[id]/state/route"
  ));
  ({ AppError } = await import("@/server/http/errors"));
});

afterEach(() => {
  authed = true;
  requireUserMock.mockClear();
  createTicketMock.mockReset();
  getTicketMock.mockReset();
  updateTicketMock.mockReset();
  updateTicketStateMock.mockReset();
  deleteTicketMock.mockReset();
});

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

describe("POST /api/tickets (contract)", () => {
  it("201 full ticket object with ISO timestamps; createdBy from session", async () => {
    createTicketMock.mockResolvedValue(sampleTicket);
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/tickets", "POST", {
        teamId: TEAM_ID,
        type: "bug",
        title: "Fix",
        body: "Broken",
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: TICKET_ID,
      teamId: TEAM_ID,
      epicId: null,
      type: "bug",
      state: "new",
      title: "Fix",
      body: "Broken",
      createdBy: "u1",
      createdAt: NOW_ISO,
      modifiedAt: NOW_ISO,
    });
    // The route passes the session user id as createdBy.
    expect(createTicketMock).toHaveBeenCalledWith(expect.any(Object), "u1");
  });

  it("400 on a bad enum (VALIDATION_ERROR envelope)", async () => {
    createTicketMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "A valid type is required", {
        fields: { type: "A valid type is required" },
      }),
    );
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/tickets", "POST", {
        teamId: TEAM_ID,
        type: "task",
        title: "T",
        body: "B",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("400 on a cross-team epic", async () => {
    createTicketMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "cross-team epic", {
        fields: { epicId: "Epic must belong to the ticket's team" },
      }),
    );
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/tickets", "POST", {
        teamId: TEAM_ID,
        type: "bug",
        title: "T",
        body: "B",
        epicId: "33333333-3333-3333-3333-333333333333",
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("404 when the team is missing", async () => {
    createTicketMock.mockRejectedValue(
      new AppError("NOT_FOUND", "Team not found"),
    );
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/tickets", "POST", {
        teamId: TEAM_ID,
        type: "bug",
        title: "T",
        body: "B",
      }) as never,
    );
    expect(res.status).toBe(404);
  });

  it("400 on non-JSON body", async () => {
    const res = await collectionPOST(
      new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(createTicketMock).not.toHaveBeenCalled();
  });

  it("401 when anonymous (before touching the service)", async () => {
    authed = false;
    const res = await collectionPOST(
      jsonRequest("http://localhost/api/tickets", "POST", {
        teamId: TEAM_ID,
        type: "bug",
        title: "T",
        body: "B",
      }) as never,
    );
    expect(res.status).toBe(401);
    expect(createTicketMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/tickets/{id} (contract)", () => {
  it("200 detail view with author email + epic title", async () => {
    getTicketMock.mockResolvedValue({
      ...sampleTicket,
      authorEmail: "author@example.com",
      epicTitle: "Login flow",
    });
    const res = await itemGET(
      new Request(`http://localhost/api/tickets/${TICKET_ID}`) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorEmail).toBe("author@example.com");
    expect(body.epicTitle).toBe("Login flow");
    expect(body.createdAt).toBe(NOW_ISO);
    expect(getTicketMock).toHaveBeenCalledWith(TICKET_ID);
  });

  it("404 for an unknown ticket", async () => {
    getTicketMock.mockRejectedValue(new AppError("NOT_FOUND", "Ticket not found"));
    const res = await itemGET(
      new Request(`http://localhost/api/tickets/${TICKET_ID}`) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(404);
  });

  it("401 when anonymous", async () => {
    authed = false;
    const res = await itemGET(
      new Request(`http://localhost/api/tickets/${TICKET_ID}`) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(401);
    expect(getTicketMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tickets/{id} (contract)", () => {
  it("200 updated ticket", async () => {
    updateTicketMock.mockResolvedValue({ ...sampleTicket, state: "done" });
    const res = await itemPATCH(
      jsonRequest(`http://localhost/api/tickets/${TICKET_ID}`, "PATCH", {
        state: "done",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).state).toBe("done");
    expect(updateTicketMock).toHaveBeenCalledWith(TICKET_ID, { state: "done" });
  });

  it("400 on a bad enum", async () => {
    updateTicketMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "A valid state is required"),
    );
    const res = await itemPATCH(
      jsonRequest(`http://localhost/api/tickets/${TICKET_ID}`, "PATCH", {
        state: "wip",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 for an unknown ticket", async () => {
    updateTicketMock.mockRejectedValue(
      new AppError("NOT_FOUND", "Ticket not found"),
    );
    const res = await itemPATCH(
      jsonRequest(`http://localhost/api/tickets/${TICKET_ID}`, "PATCH", {
        title: "X",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(404);
  });

  it("401 when anonymous", async () => {
    authed = false;
    const res = await itemPATCH(
      jsonRequest(`http://localhost/api/tickets/${TICKET_ID}`, "PATCH", {
        title: "X",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(401);
    expect(updateTicketMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tickets/{id}/state (contract)", () => {
  it("200 compact { id, state, modifiedAt } with ISO timestamp", async () => {
    updateTicketStateMock.mockResolvedValue({
      id: TICKET_ID,
      state: "done",
      modifiedAt: new Date(NOW_ISO),
    });
    const res = await statePATCH(
      jsonRequest(
        `http://localhost/api/tickets/${TICKET_ID}/state`,
        "PATCH",
        { state: "done" },
      ) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: TICKET_ID,
      state: "done",
      modifiedAt: NOW_ISO,
    });
    expect(updateTicketStateMock).toHaveBeenCalledWith(TICKET_ID, {
      state: "done",
    });
  });

  it("400 on an invalid state", async () => {
    updateTicketStateMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "A valid state is required"),
    );
    const res = await statePATCH(
      jsonRequest(
        `http://localhost/api/tickets/${TICKET_ID}/state`,
        "PATCH",
        { state: "wip" },
      ) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("400 on non-JSON body (before touching the service)", async () => {
    const res = await statePATCH(
      new Request(`http://localhost/api/tickets/${TICKET_ID}/state`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "not json",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(400);
    expect(updateTicketStateMock).not.toHaveBeenCalled();
  });

  it("404 for an unknown ticket", async () => {
    updateTicketStateMock.mockRejectedValue(
      new AppError("NOT_FOUND", "Ticket not found"),
    );
    const res = await statePATCH(
      jsonRequest(
        `http://localhost/api/tickets/${TICKET_ID}/state`,
        "PATCH",
        { state: "done" },
      ) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(404);
  });

  it("401 when anonymous (before touching the service)", async () => {
    authed = false;
    const res = await statePATCH(
      jsonRequest(
        `http://localhost/api/tickets/${TICKET_ID}/state`,
        "PATCH",
        { state: "done" },
      ) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(401);
    expect(updateTicketStateMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tickets/{id} (contract)", () => {
  it("204 on success", async () => {
    deleteTicketMock.mockResolvedValue(undefined);
    const res = await itemDELETE(
      new Request(`http://localhost/api/tickets/${TICKET_ID}`, {
        method: "DELETE",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(204);
    expect(deleteTicketMock).toHaveBeenCalledWith(TICKET_ID);
  });

  it("404 for an unknown ticket", async () => {
    deleteTicketMock.mockRejectedValue(
      new AppError("NOT_FOUND", "Ticket not found"),
    );
    const res = await itemDELETE(
      new Request(`http://localhost/api/tickets/${TICKET_ID}`, {
        method: "DELETE",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(404);
  });

  it("401 when anonymous", async () => {
    authed = false;
    const res = await itemDELETE(
      new Request(`http://localhost/api/tickets/${TICKET_ID}`, {
        method: "DELETE",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(401);
    expect(deleteTicketMock).not.toHaveBeenCalled();
  });
});
