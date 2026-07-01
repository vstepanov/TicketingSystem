import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/server/http/errors";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "epic-unit-secret-of-sufficient-length!!!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

// Mock the repository so the unit test isolates the service's business rules
// (trimming, teamId handling, no-op detection) without a real database.
const listEpicsByTeamWithCounts = vi.fn();
const findEpicById = vi.fn();
const insertEpic = vi.fn();
const updateEpicRepo = vi.fn();
const deleteEpicRepo = vi.fn();
const countEpicReferences = vi.fn();
const teamExists = vi.fn();

vi.mock("@/server/repositories/epic.repo", () => ({
  listEpicsByTeamWithCounts: (...a: unknown[]) =>
    listEpicsByTeamWithCounts(...a),
  findEpicById: (...a: unknown[]) => findEpicById(...a),
  insertEpic: (...a: unknown[]) => insertEpic(...a),
  updateEpic: (...a: unknown[]) => updateEpicRepo(...a),
  deleteEpic: (...a: unknown[]) => deleteEpicRepo(...a),
  countEpicReferences: (...a: unknown[]) => countEpicReferences(...a),
  teamExists: (...a: unknown[]) => teamExists(...a),
}));

const fakeDb = {} as never;
const TEAM_ID = "11111111-1111-1111-1111-111111111111";

let service: typeof import("@/server/services/epic.service");

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected the service to throw");
}

beforeAll(async () => {
  service = await import("@/server/services/epic.service");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createEpic (unit)", () => {
  it("trims the title and sets the team", async () => {
    teamExists.mockResolvedValue(true);
    const now = new Date();
    insertEpic.mockImplementation(
      async (input: {
        teamId: string;
        title: string;
        description: string | null;
      }) => ({
        id: "e1",
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        createdAt: now,
        modifiedAt: now,
      }),
    );

    const view = await service.createEpic(
      { teamId: TEAM_ID, title: "  Login flow  " },
      fakeDb,
    );

    expect(insertEpic).toHaveBeenCalledWith(
      { teamId: TEAM_ID, title: "Login flow", description: null },
      fakeDb,
    );
    expect(view.title).toBe("Login flow");
    expect(view.teamId).toBe(TEAM_ID);
    expect(view.description).toBeNull();
    expect(view.ticketCount).toBe(0);
    expect(view.canDelete).toBe(true);
  });

  it("normalises a whitespace-only description to null", async () => {
    teamExists.mockResolvedValue(true);
    const now = new Date();
    insertEpic.mockImplementation(
      async (input: { description: string | null }) => ({
        id: "e1",
        teamId: TEAM_ID,
        title: "T",
        description: input.description,
        createdAt: now,
        modifiedAt: now,
      }),
    );

    await service.createEpic(
      { teamId: TEAM_ID, title: "T", description: "   " },
      fakeDb,
    );
    expect(insertEpic).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
      fakeDb,
    );
  });

  it("rejects an empty title with 400", async () => {
    const err = await expectAppError(
      service.createEpic({ teamId: TEAM_ID, title: "   " }, fakeDb),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(insertEpic).not.toHaveBeenCalled();
  });

  it("rejects a missing/invalid teamId with 400", async () => {
    const err = await expectAppError(
      service.createEpic({ title: "T" }, fakeDb),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);

    const err2 = await expectAppError(
      service.createEpic({ teamId: "not-a-uuid", title: "T" }, fakeDb),
    );
    expect(err2.status).toBe(400);
    expect(teamExists).not.toHaveBeenCalled();
  });

  it("404s when the team does not exist", async () => {
    teamExists.mockResolvedValue(false);
    const err = await expectAppError(
      service.createEpic({ teamId: TEAM_ID, title: "T" }, fakeDb),
    );
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(insertEpic).not.toHaveBeenCalled();
  });
});

describe("updateEpic (unit) — team immutability + no-op", () => {
  const existing = {
    id: "e1",
    teamId: TEAM_ID,
    title: "Login flow",
    description: "desc",
    createdAt: new Date("2020-01-01T00:00:00Z"),
    modifiedAt: new Date("2020-01-01T00:00:00Z"),
  };

  it("rejects a teamId in the body with 400 (team immutable)", async () => {
    const err = await expectAppError(
      service.updateEpic(
        "e1",
        { teamId: "22222222-2222-2222-2222-222222222222", title: "X" },
        fakeDb,
      ),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    // Rejected at the schema boundary — no read/write happened.
    expect(findEpicById).not.toHaveBeenCalled();
    expect(updateEpicRepo).not.toHaveBeenCalled();
  });

  it("treats an identical (trimmed) title as a no-op and does NOT update modified_at", async () => {
    findEpicById.mockResolvedValue(existing);
    countEpicReferences.mockResolvedValue(0);

    const view = await service.updateEpic(
      "e1",
      { title: "  Login flow  " },
      fakeDb,
    );

    expect(updateEpicRepo).not.toHaveBeenCalled();
    expect(view.modifiedAt).toEqual(existing.modifiedAt);
    expect(view.title).toBe("Login flow");
  });

  it("treats a body with no changed fields as a no-op", async () => {
    findEpicById.mockResolvedValue(existing);
    countEpicReferences.mockResolvedValue(0);

    await service.updateEpic(
      "e1",
      { title: "Login flow", description: "desc" },
      fakeDb,
    );
    expect(updateEpicRepo).not.toHaveBeenCalled();
  });

  it("updates modified_at on a real title change", async () => {
    findEpicById.mockResolvedValue(existing);
    const later = new Date("2021-06-01T00:00:00Z");
    updateEpicRepo.mockResolvedValue({
      ...existing,
      title: "Signup flow",
      modifiedAt: later,
    });
    countEpicReferences.mockResolvedValue(0);

    const view = await service.updateEpic(
      "e1",
      { title: "Signup flow" },
      fakeDb,
    );

    expect(updateEpicRepo).toHaveBeenCalledWith(
      "e1",
      { title: "Signup flow", description: "desc" },
      fakeDb,
    );
    expect(view.title).toBe("Signup flow");
    expect(view.modifiedAt).toEqual(later);
  });

  it("can clear the description (real change)", async () => {
    findEpicById.mockResolvedValue(existing);
    const later = new Date("2021-06-01T00:00:00Z");
    updateEpicRepo.mockResolvedValue({
      ...existing,
      description: null,
      modifiedAt: later,
    });
    countEpicReferences.mockResolvedValue(0);

    await service.updateEpic("e1", { description: "  " }, fakeDb);
    expect(updateEpicRepo).toHaveBeenCalledWith(
      "e1",
      { title: "Login flow", description: null },
      fakeDb,
    );
  });

  it("rejects an empty title when present with 400", async () => {
    const err = await expectAppError(
      service.updateEpic("e1", { title: "   " }, fakeDb),
    );
    expect(err.status).toBe(400);
    expect(findEpicById).not.toHaveBeenCalled();
  });

  it("404s an unknown epic", async () => {
    findEpicById.mockResolvedValue(undefined);
    const err = await expectAppError(
      service.updateEpic("missing", { title: "X" }, fakeDb),
    );
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
  });
});

describe("deleteEpic (unit)", () => {
  it("404s an unknown epic", async () => {
    findEpicById.mockResolvedValue(undefined);
    const err = await expectAppError(service.deleteEpic("missing", fakeDb));
    expect(err.code).toBe("NOT_FOUND");
  });

  it("409 EPIC_REFERENCED when tickets reference it", async () => {
    findEpicById.mockResolvedValue({ id: "e1", teamId: TEAM_ID });
    countEpicReferences.mockResolvedValue(3);
    const err = await expectAppError(service.deleteEpic("e1", fakeDb));
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
    expect(deleteEpicRepo).not.toHaveBeenCalled();
  });

  it("deletes an unreferenced epic", async () => {
    findEpicById.mockResolvedValue({ id: "e1", teamId: TEAM_ID });
    countEpicReferences.mockResolvedValue(0);
    deleteEpicRepo.mockResolvedValue(true);
    await expect(service.deleteEpic("e1", fakeDb)).resolves.toBeUndefined();
    expect(deleteEpicRepo).toHaveBeenCalledWith("e1", fakeDb);
  });
});

describe("listEpics (unit)", () => {
  it("rejects a missing teamId with 400", async () => {
    const err = await expectAppError(service.listEpics(undefined, fakeDb));
    expect(err.status).toBe(400);
    expect(listEpicsByTeamWithCounts).not.toHaveBeenCalled();
  });

  it("maps rows to views with canDelete derived from ticketCount", async () => {
    listEpicsByTeamWithCounts.mockResolvedValue([
      {
        id: "e1",
        teamId: TEAM_ID,
        title: "A",
        description: null,
        createdAt: new Date(),
        modifiedAt: new Date(),
        ticketCount: 0,
      },
      {
        id: "e2",
        teamId: TEAM_ID,
        title: "B",
        description: "d",
        createdAt: new Date(),
        modifiedAt: new Date(),
        ticketCount: 2,
      },
    ]);
    const list = await service.listEpics(TEAM_ID, fakeDb);
    expect(list[0].canDelete).toBe(true);
    expect(list[1].canDelete).toBe(false);
    expect(list[1].ticketCount).toBe(2);
  });
});
