import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/server/http/errors";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "comment-unit-secret-of-sufficient-length!!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

// Mock the repository so the unit test isolates the service's business rules
// (non-empty validation, 404 pre-check, author-from-session) without a DB.
const ticketExists = vi.fn();
const listCommentsByTicket = vi.fn();
const insertComment = vi.fn();

vi.mock("@/server/repositories/comment.repo", () => ({
  ticketExists: (...a: unknown[]) => ticketExists(...a),
  listCommentsByTicket: (...a: unknown[]) => listCommentsByTicket(...a),
  insertComment: (...a: unknown[]) => insertComment(...a),
}));

const fakeDb = {} as never;
const TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "44444444-4444-4444-4444-444444444444";

let service: typeof import("@/server/services/comment.service");

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected the service to throw");
}

beforeAll(async () => {
  service = await import("@/server/services/comment.service");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createComment (unit) — non-empty body + author from session", () => {
  it("rejects an empty/whitespace-only body with 400 before hitting the DB", async () => {
    const err = await expectAppError(
      service.createComment(TICKET_ID, { body: "   " }, USER_ID, fakeDb),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(ticketExists).not.toHaveBeenCalled();
    expect(insertComment).not.toHaveBeenCalled();
  });

  it("rejects a missing body with 400", async () => {
    const err = await expectAppError(
      service.createComment(TICKET_ID, {}, USER_ID, fakeDb),
    );
    expect(err.status).toBe(400);
    expect(insertComment).not.toHaveBeenCalled();
  });

  it("rejects unknown fields in the body with 400 (strict)", async () => {
    const err = await expectAppError(
      service.createComment(TICKET_ID, { body: "hi", bogus: 1 }, USER_ID, fakeDb),
    );
    expect(err.status).toBe(400);
    expect(insertComment).not.toHaveBeenCalled();
  });

  it("404s when the ticket does not exist", async () => {
    ticketExists.mockResolvedValue(false);
    const err = await expectAppError(
      service.createComment(TICKET_ID, { body: "hello" }, USER_ID, fakeDb),
    );
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(insertComment).not.toHaveBeenCalled();
  });

  it("trims the body, sets author from the session, and shapes the view", async () => {
    ticketExists.mockResolvedValue(true);
    const now = new Date("2020-01-01T00:00:00Z");
    insertComment.mockResolvedValue({
      id: "c1",
      authorId: USER_ID,
      authorEmail: "a@b.com",
      body: "hello",
      createdAt: now,
    });

    const view = await service.createComment(
      TICKET_ID,
      { body: "  hello  " },
      USER_ID,
      fakeDb,
    );

    // Body trimmed and author id is the session user (never from the body).
    expect(insertComment).toHaveBeenCalledWith(
      { ticketId: TICKET_ID, authorId: USER_ID, body: "hello" },
      fakeDb,
    );
    expect(view).toEqual({
      id: "c1",
      author: { id: USER_ID, email: "a@b.com" },
      body: "hello",
      createdAt: now,
    });
  });
});

describe("listComments (unit)", () => {
  it("404s when the ticket does not exist (before listing)", async () => {
    ticketExists.mockResolvedValue(false);
    const err = await expectAppError(service.listComments(TICKET_ID, fakeDb));
    expect(err.code).toBe("NOT_FOUND");
    expect(listCommentsByTicket).not.toHaveBeenCalled();
  });

  it("maps rows to the { id, author, body, createdAt } view", async () => {
    ticketExists.mockResolvedValue(true);
    const now = new Date("2020-01-01T00:00:00Z");
    listCommentsByTicket.mockResolvedValue([
      { id: "c1", authorId: USER_ID, authorEmail: "a@b.com", body: "first", createdAt: now },
    ]);
    const list = await service.listComments(TICKET_ID, fakeDb);
    expect(list).toEqual([
      {
        id: "c1",
        author: { id: USER_ID, email: "a@b.com" },
        body: "first",
        createdAt: now,
      },
    ]);
  });
});
