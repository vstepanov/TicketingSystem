import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "comments-routes-secret-of-sufficient-length!!";
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
const listCommentsMock = vi.fn();
const createCommentMock = vi.fn();
vi.mock("@/server/services/comment.service", () => ({
  listComments: (...a: unknown[]) => listCommentsMock(...a),
  createComment: (...a: unknown[]) => createCommentMock(...a),
}));

let GET: typeof import("../../app/api/tickets/[id]/comments/route").GET;
let POST: typeof import("../../app/api/tickets/[id]/comments/route").POST;
let AppError: typeof import("@/server/http/errors").AppError;

const TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW_ISO = "2020-01-01T00:00:00.000Z";

const sampleComment = {
  id: "c1",
  author: { id: "u1", email: "a@b.com" },
  body: "hello",
  createdAt: new Date(NOW_ISO),
};

beforeAll(async () => {
  ({ GET, POST } = await import("../../app/api/tickets/[id]/comments/route"));
  ({ AppError } = await import("@/server/http/errors"));
});

afterEach(() => {
  authed = true;
  requireUserMock.mockClear();
  listCommentsMock.mockReset();
  createCommentMock.mockReset();
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

const commentsUrl = `http://localhost/api/tickets/${TICKET_ID}/comments`;

describe("GET /api/tickets/{id}/comments (contract)", () => {
  it("200 array of { id, author, body, createdAt } with ISO timestamps", async () => {
    listCommentsMock.mockResolvedValue([sampleComment]);
    const res = await GET(new Request(commentsUrl) as never, ctxFor(TICKET_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      {
        id: "c1",
        author: { id: "u1", email: "a@b.com" },
        body: "hello",
        createdAt: NOW_ISO,
      },
    ]);
    expect(listCommentsMock).toHaveBeenCalledWith(TICKET_ID);
  });

  it("404 for an unknown ticket", async () => {
    listCommentsMock.mockRejectedValue(new AppError("NOT_FOUND", "Ticket not found"));
    const res = await GET(new Request(commentsUrl) as never, ctxFor(TICKET_ID));
    expect(res.status).toBe(404);
  });

  it("401 when anonymous (before touching the service)", async () => {
    authed = false;
    const res = await GET(new Request(commentsUrl) as never, ctxFor(TICKET_ID));
    expect(res.status).toBe(401);
    expect(listCommentsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/tickets/{id}/comments (contract)", () => {
  it("201 comment; author id passed from the session (never the body)", async () => {
    createCommentMock.mockResolvedValue(sampleComment);
    const res = await POST(
      jsonRequest(commentsUrl, "POST", { body: "hello" }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: "c1",
      author: { id: "u1", email: "a@b.com" },
      body: "hello",
      createdAt: NOW_ISO,
    });
    // ticketId from the path, body forwarded, author id from the session user.
    expect(createCommentMock).toHaveBeenCalledWith(
      TICKET_ID,
      { body: "hello" },
      "u1",
    );
  });

  it("400 on an empty body (VALIDATION_ERROR envelope)", async () => {
    createCommentMock.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "Comment body is required", {
        fields: { body: "Comment body is required" },
      }),
    );
    const res = await POST(
      jsonRequest(commentsUrl, "POST", { body: "   " }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("400 on a non-JSON body (before touching the service)", async () => {
    const res = await POST(
      new Request(commentsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(400);
    expect(createCommentMock).not.toHaveBeenCalled();
  });

  it("404 when the ticket is missing", async () => {
    createCommentMock.mockRejectedValue(new AppError("NOT_FOUND", "Ticket not found"));
    const res = await POST(
      jsonRequest(commentsUrl, "POST", { body: "hello" }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(404);
  });

  it("401 when anonymous (before touching the service)", async () => {
    authed = false;
    const res = await POST(
      jsonRequest(commentsUrl, "POST", { body: "hello" }) as never,
      ctxFor(TICKET_ID),
    );
    expect(res.status).toBe(401);
    expect(createCommentMock).not.toHaveBeenCalled();
  });
});
