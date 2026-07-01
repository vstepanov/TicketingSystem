import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/server/http/errors";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "ticket-unit-secret-of-sufficient-length!!!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

// Mock the repository so the unit test isolates the service's business rules
// (enum validation, no-op detection, cross-team epic pre-check) without a DB.
const findTicketById = vi.fn();
const findTicketDetailById = vi.fn();
const insertTicket = vi.fn();
const updateTicketRepo = vi.fn();
const updateTicketStateRepo = vi.fn();
const deleteTicketRepo = vi.fn();
const teamExists = vi.fn();
const findEpicTeam = vi.fn();

vi.mock("@/server/repositories/ticket.repo", () => ({
  findTicketById: (...a: unknown[]) => findTicketById(...a),
  findTicketDetailById: (...a: unknown[]) => findTicketDetailById(...a),
  insertTicket: (...a: unknown[]) => insertTicket(...a),
  updateTicket: (...a: unknown[]) => updateTicketRepo(...a),
  updateTicketState: (...a: unknown[]) => updateTicketStateRepo(...a),
  deleteTicket: (...a: unknown[]) => deleteTicketRepo(...a),
  teamExists: (...a: unknown[]) => teamExists(...a),
  findEpicTeam: (...a: unknown[]) => findEpicTeam(...a),
}));

const fakeDb = {} as never;
const TEAM_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_TEAM = "22222222-2222-2222-2222-222222222222";
const EPIC_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";

let service: typeof import("@/server/services/ticket.service");

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected the service to throw");
}

beforeAll(async () => {
  service = await import("@/server/services/ticket.service");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createTicket (unit) — enum guards + defaults", () => {
  it("defaults state to 'new', trims title/body, sets createdBy from session", async () => {
    teamExists.mockResolvedValue(true);
    const now = new Date();
    insertTicket.mockImplementation(async (f: Record<string, unknown>) => ({
      id: "t1",
      teamId: f.teamId,
      epicId: f.epicId,
      type: f.type,
      state: f.state,
      title: f.title,
      body: f.body,
      createdBy: f.createdBy,
      createdAt: now,
      modifiedAt: now,
    }));

    const view = await service.createTicket(
      { teamId: TEAM_ID, type: "bug", title: "  Fix  ", body: "  Broken  " },
      USER_ID,
      fakeDb,
    );

    expect(insertTicket).toHaveBeenCalledWith(
      {
        teamId: TEAM_ID,
        epicId: null,
        type: "bug",
        state: "new",
        title: "Fix",
        body: "Broken",
        createdBy: USER_ID,
      },
      fakeDb,
    );
    expect(view.state).toBe("new");
    expect(view.createdBy).toBe(USER_ID);
    expect(view.epicId).toBeNull();
  });

  it("rejects an unknown type enum with 400 before hitting the DB", async () => {
    const err = await expectAppError(
      service.createTicket(
        { teamId: TEAM_ID, type: "task", title: "T", body: "B" },
        USER_ID,
        fakeDb,
      ),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(teamExists).not.toHaveBeenCalled();
    expect(insertTicket).not.toHaveBeenCalled();
  });

  it("rejects an unknown state enum with 400", async () => {
    const err = await expectAppError(
      service.createTicket(
        { teamId: TEAM_ID, type: "bug", title: "T", body: "B", state: "wip" },
        USER_ID,
        fakeDb,
      ),
    );
    expect(err.status).toBe(400);
    expect(insertTicket).not.toHaveBeenCalled();
  });

  it("rejects empty title/body with 400", async () => {
    const err = await expectAppError(
      service.createTicket(
        { teamId: TEAM_ID, type: "bug", title: "   ", body: "B" },
        USER_ID,
        fakeDb,
      ),
    );
    expect(err.status).toBe(400);

    const err2 = await expectAppError(
      service.createTicket(
        { teamId: TEAM_ID, type: "bug", title: "T", body: "   " },
        USER_ID,
        fakeDb,
      ),
    );
    expect(err2.status).toBe(400);
  });

  it("404s when the team does not exist", async () => {
    teamExists.mockResolvedValue(false);
    const err = await expectAppError(
      service.createTicket(
        { teamId: TEAM_ID, type: "bug", title: "T", body: "B" },
        USER_ID,
        fakeDb,
      ),
    );
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(insertTicket).not.toHaveBeenCalled();
  });

  it("rejects a cross-team epic on create with 400 (pre-check)", async () => {
    teamExists.mockResolvedValue(true);
    findEpicTeam.mockResolvedValue({ id: EPIC_ID, teamId: OTHER_TEAM });
    const err = await expectAppError(
      service.createTicket(
        { teamId: TEAM_ID, type: "bug", title: "T", body: "B", epicId: EPIC_ID },
        USER_ID,
        fakeDb,
      ),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(err.fields?.epicId).toBeDefined();
    expect(insertTicket).not.toHaveBeenCalled();
  });

  it("rejects a missing epic on create with 400", async () => {
    teamExists.mockResolvedValue(true);
    findEpicTeam.mockResolvedValue(undefined);
    const err = await expectAppError(
      service.createTicket(
        { teamId: TEAM_ID, type: "bug", title: "T", body: "B", epicId: EPIC_ID },
        USER_ID,
        fakeDb,
      ),
    );
    expect(err.status).toBe(400);
    expect(insertTicket).not.toHaveBeenCalled();
  });

  it("accepts a same-team epic on create", async () => {
    teamExists.mockResolvedValue(true);
    findEpicTeam.mockResolvedValue({ id: EPIC_ID, teamId: TEAM_ID });
    const now = new Date();
    insertTicket.mockResolvedValue({
      id: "t1",
      teamId: TEAM_ID,
      epicId: EPIC_ID,
      type: "bug",
      state: "new",
      title: "T",
      body: "B",
      createdBy: USER_ID,
      createdAt: now,
      modifiedAt: now,
    });
    const view = await service.createTicket(
      { teamId: TEAM_ID, type: "bug", title: "T", body: "B", epicId: EPIC_ID },
      USER_ID,
      fakeDb,
    );
    expect(view.epicId).toBe(EPIC_ID);
  });
});

describe("updateTicket (unit) — no-op detection + cross-team epic", () => {
  const existing = {
    id: "t1",
    teamId: TEAM_ID,
    epicId: null as string | null,
    type: "bug" as const,
    state: "new" as const,
    title: "Fix",
    body: "Broken",
    createdBy: USER_ID,
    createdAt: new Date("2020-01-01T00:00:00Z"),
    modifiedAt: new Date("2020-01-01T00:00:00Z"),
  };

  it("treats identical (trimmed) values as a no-op and does NOT update modified_at", async () => {
    findTicketById.mockResolvedValue(existing);
    const view = await service.updateTicket(
      "t1",
      { title: "  Fix  ", body: "Broken", type: "bug", state: "new" },
      fakeDb,
    );
    expect(updateTicketRepo).not.toHaveBeenCalled();
    expect(view.modifiedAt).toEqual(existing.modifiedAt);
    expect(view.title).toBe("Fix");
  });

  it("updates modified_at on a real state change", async () => {
    findTicketById.mockResolvedValue(existing);
    const later = new Date("2021-06-01T00:00:00Z");
    updateTicketRepo.mockResolvedValue({
      ...existing,
      state: "in_progress",
      modifiedAt: later,
    });
    const view = await service.updateTicket(
      "t1",
      { state: "in_progress" },
      fakeDb,
    );
    expect(updateTicketRepo).toHaveBeenCalledWith(
      "t1",
      {
        teamId: TEAM_ID,
        epicId: null,
        type: "bug",
        state: "in_progress",
        title: "Fix",
        body: "Broken",
      },
      fakeDb,
    );
    expect(view.state).toBe("in_progress");
    expect(view.modifiedAt).toEqual(later);
  });

  it("rejects an unknown enum on patch with 400", async () => {
    const err = await expectAppError(
      service.updateTicket("t1", { state: "wip" }, fakeDb),
    );
    expect(err.status).toBe(400);
    expect(findTicketById).not.toHaveBeenCalled();
  });

  it("rejects an empty title on patch with 400", async () => {
    const err = await expectAppError(
      service.updateTicket("t1", { title: "  " }, fakeDb),
    );
    expect(err.status).toBe(400);
  });

  it("404s an unknown ticket", async () => {
    findTicketById.mockResolvedValue(undefined);
    const err = await expectAppError(
      service.updateTicket("missing", { title: "X" }, fakeDb),
    );
    expect(err.code).toBe("NOT_FOUND");
  });

  it("rejects a direct cross-team epic change with 400", async () => {
    findTicketById.mockResolvedValue(existing);
    findEpicTeam.mockResolvedValue({ id: EPIC_ID, teamId: OTHER_TEAM });
    const err = await expectAppError(
      service.updateTicket("t1", { epicId: EPIC_ID }, fakeDb),
    );
    expect(err.status).toBe(400);
    expect(updateTicketRepo).not.toHaveBeenCalled();
  });

  it("rejects a team change that leaves a stale (now cross-team) epic with 400", async () => {
    findTicketById.mockResolvedValue({ ...existing, epicId: EPIC_ID });
    // Epic still belongs to the OLD team, but ticket is moving to OTHER_TEAM.
    findEpicTeam.mockResolvedValue({ id: EPIC_ID, teamId: TEAM_ID });
    const err = await expectAppError(
      service.updateTicket("t1", { teamId: OTHER_TEAM }, fakeDb),
    );
    expect(err.status).toBe(400);
    expect(updateTicketRepo).not.toHaveBeenCalled();
  });

  it("allows a team change when epic is cleared to null in the same patch", async () => {
    findTicketById.mockResolvedValue({ ...existing, epicId: EPIC_ID });
    const later = new Date("2021-06-01T00:00:00Z");
    updateTicketRepo.mockResolvedValue({
      ...existing,
      teamId: OTHER_TEAM,
      epicId: null,
      modifiedAt: later,
    });
    const view = await service.updateTicket(
      "t1",
      { teamId: OTHER_TEAM, epicId: null },
      fakeDb,
    );
    expect(view.teamId).toBe(OTHER_TEAM);
    expect(view.epicId).toBeNull();
    // findEpicTeam not consulted: resolved epic is null.
    expect(findEpicTeam).not.toHaveBeenCalled();
  });

  it("maps a residual FK/composite-FK write violation to 400 (not 409)", async () => {
    findTicketById.mockResolvedValue(existing);
    findEpicTeam.mockResolvedValue({ id: EPIC_ID, teamId: TEAM_ID });
    // Pre-check passes, but the DB trips a FK violation on write (concurrent
    // change). It must surface as a 400 validation error, not a 409.
    const pgErr = Object.assign(new Error("insert failed"), {
      cause: { code: "23503" },
    });
    updateTicketRepo.mockRejectedValue(pgErr);
    const err = await expectAppError(
      service.updateTicket("t1", { epicId: EPIC_ID }, fakeDb),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
  });

  it("rejects unknown fields in the patch body with 400 (strict)", async () => {
    const err = await expectAppError(
      service.updateTicket("t1", { bogus: 1 }, fakeDb),
    );
    expect(err.status).toBe(400);
  });
});

describe("updateTicketState (unit) — enum guard + real-change semantics", () => {
  const existing = {
    id: "t1",
    teamId: TEAM_ID,
    epicId: null as string | null,
    type: "bug" as const,
    state: "new" as const,
    title: "Fix",
    body: "Broken",
    createdBy: USER_ID,
    createdAt: new Date("2020-01-01T00:00:00Z"),
    modifiedAt: new Date("2020-01-01T00:00:00Z"),
  };

  it("rejects an unknown state enum with 400 before hitting the DB", async () => {
    const err = await expectAppError(
      service.updateTicketState("t1", { state: "wip" }, fakeDb),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(findTicketById).not.toHaveBeenCalled();
    expect(updateTicketStateRepo).not.toHaveBeenCalled();
  });

  it("rejects a missing state with 400", async () => {
    const err = await expectAppError(
      service.updateTicketState("t1", {}, fakeDb),
    );
    expect(err.status).toBe(400);
    expect(updateTicketStateRepo).not.toHaveBeenCalled();
  });

  it("rejects unknown fields in the body with 400 (strict)", async () => {
    const err = await expectAppError(
      service.updateTicketState("t1", { state: "done", bogus: 1 }, fakeDb),
    );
    expect(err.status).toBe(400);
    expect(findTicketById).not.toHaveBeenCalled();
  });

  it("404s an unknown ticket", async () => {
    findTicketById.mockResolvedValue(undefined);
    const err = await expectAppError(
      service.updateTicketState("missing", { state: "done" }, fakeDb),
    );
    expect(err.code).toBe("NOT_FOUND");
    expect(updateTicketStateRepo).not.toHaveBeenCalled();
  });

  it("allows any state → any state and advances modified_at on a real change", async () => {
    findTicketById.mockResolvedValue(existing);
    const later = new Date("2021-06-01T00:00:00Z");
    // "new" → "done" jumps columns (sequential transitions not enforced).
    updateTicketStateRepo.mockResolvedValue({
      ...existing,
      state: "done",
      modifiedAt: later,
    });
    const view = await service.updateTicketState("t1", { state: "done" }, fakeDb);
    expect(updateTicketStateRepo).toHaveBeenCalledWith("t1", "done", fakeDb);
    expect(view).toEqual({ id: "t1", state: "done", modifiedAt: later });
  });

  it("is a no-op (no write, modified_at unchanged) when state equals current", async () => {
    findTicketById.mockResolvedValue(existing);
    const view = await service.updateTicketState("t1", { state: "new" }, fakeDb);
    expect(updateTicketStateRepo).not.toHaveBeenCalled();
    expect(view).toEqual({
      id: "t1",
      state: "new",
      modifiedAt: existing.modifiedAt,
    });
  });

  it("404s if the ticket is deleted between the read and the write", async () => {
    findTicketById.mockResolvedValue(existing);
    updateTicketStateRepo.mockResolvedValue(undefined);
    const err = await expectAppError(
      service.updateTicketState("t1", { state: "done" }, fakeDb),
    );
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("getTicket (unit)", () => {
  it("404s an unknown ticket", async () => {
    findTicketDetailById.mockResolvedValue(undefined);
    const err = await expectAppError(service.getTicket("missing", fakeDb));
    expect(err.code).toBe("NOT_FOUND");
  });

  it("returns the detail view with author email + epic title", async () => {
    const now = new Date();
    findTicketDetailById.mockResolvedValue({
      id: "t1",
      teamId: TEAM_ID,
      epicId: EPIC_ID,
      type: "bug",
      state: "new",
      title: "Fix",
      body: "Broken",
      createdBy: USER_ID,
      createdAt: now,
      modifiedAt: now,
      authorEmail: "a@b.com",
      epicTitle: "Login flow",
    });
    const view = await service.getTicket("t1", fakeDb);
    expect(view.authorEmail).toBe("a@b.com");
    expect(view.epicTitle).toBe("Login flow");
  });
});

describe("deleteTicket (unit)", () => {
  it("404s an unknown ticket", async () => {
    deleteTicketRepo.mockResolvedValue(false);
    const err = await expectAppError(service.deleteTicket("missing", fakeDb));
    expect(err.code).toBe("NOT_FOUND");
  });

  it("resolves void when a ticket is removed", async () => {
    deleteTicketRepo.mockResolvedValue(true);
    await expect(service.deleteTicket("t1", fakeDb)).resolves.toBeUndefined();
  });
});
