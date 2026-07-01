import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/server/http/errors";

// Full valid env before importing anything that reads it.
process.env.SESSION_SECRET ??= "team-unit-secret-of-sufficient-length!!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

// Mock the repository so the unit test isolates the service's business rules
// (trimming, uniqueness comparison, no-op detection) without a real database.
const findTeamByName = vi.fn();
const findTeamById = vi.fn();
const insertTeam = vi.fn();
const updateTeamName = vi.fn();
const deleteTeamRepo = vi.fn();
const countTeamReferences = vi.fn();
const listTeamsWithCounts = vi.fn();

vi.mock("@/server/repositories/team.repo", () => ({
  findTeamByName: (...a: unknown[]) => findTeamByName(...a),
  findTeamById: (...a: unknown[]) => findTeamById(...a),
  insertTeam: (...a: unknown[]) => insertTeam(...a),
  updateTeamName: (...a: unknown[]) => updateTeamName(...a),
  deleteTeam: (...a: unknown[]) => deleteTeamRepo(...a),
  countTeamReferences: (...a: unknown[]) => countTeamReferences(...a),
  listTeamsWithCounts: (...a: unknown[]) => listTeamsWithCounts(...a),
}));

// Avoid opening a real DB connection; the service passes a client through, but
// the mocked repo ignores it entirely.
const fakeDb = {} as never;

let service: typeof import("@/server/services/team.service");

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected the service to throw");
}

beforeAll(async () => {
  service = await import("@/server/services/team.service");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createTeam (unit)", () => {
  it("trims the name before persisting", async () => {
    findTeamByName.mockResolvedValue(undefined);
    const now = new Date();
    insertTeam.mockImplementation(async (name: string) => ({
      id: "t1",
      name,
      createdAt: now,
      modifiedAt: now,
    }));

    const view = await service.createTeam({ name: "  Payments  " }, fakeDb);

    expect(insertTeam).toHaveBeenCalledWith("Payments", fakeDb);
    expect(view.name).toBe("Payments");
    expect(view.canDelete).toBe(true);
    expect(view.ticketCount).toBe(0);
    expect(view.epicCount).toBe(0);
  });

  it("rejects an empty / whitespace-only name with 400", async () => {
    const err = await expectAppError(
      service.createTeam({ name: "   " }, fakeDb),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(insertTeam).not.toHaveBeenCalled();
  });

  it("rejects a case-insensitive duplicate with 409 before inserting", async () => {
    findTeamByName.mockResolvedValue({
      id: "t0",
      name: "Payments",
      createdAt: new Date(),
      modifiedAt: new Date(),
    });

    const err = await expectAppError(
      service.createTeam({ name: "payments" }, fakeDb),
    );
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
    // The pre-check queries with the TRIMMED name.
    expect(findTeamByName).toHaveBeenCalledWith("payments", undefined, fakeDb);
    expect(insertTeam).not.toHaveBeenCalled();
  });
});

describe("renameTeam (unit)", () => {
  const existing = {
    id: "t1",
    name: "Payments",
    createdAt: new Date("2020-01-01T00:00:00Z"),
    modifiedAt: new Date("2020-01-01T00:00:00Z"),
  };

  it("treats a pure case change as a no-op and does NOT update modified_at", async () => {
    findTeamById.mockResolvedValue(existing);
    countTeamReferences.mockResolvedValue({ ticketCount: 0, epicCount: 0 });

    const view = await service.renameTeam("t1", { name: "payments" }, fakeDb);

    // No write happened → modified_at is unchanged (the original row's value).
    expect(updateTeamName).not.toHaveBeenCalled();
    expect(view.modifiedAt).toEqual(existing.modifiedAt);
    expect(view.name).toBe("Payments");
  });

  it("treats an identical (trimmed) name as a no-op", async () => {
    findTeamById.mockResolvedValue(existing);
    countTeamReferences.mockResolvedValue({ ticketCount: 0, epicCount: 0 });

    await service.renameTeam("t1", { name: "  Payments  " }, fakeDb);
    expect(updateTeamName).not.toHaveBeenCalled();
  });

  it("updates modified_at on a real name change", async () => {
    findTeamById.mockResolvedValue(existing);
    findTeamByName.mockResolvedValue(undefined);
    const later = new Date("2021-06-01T00:00:00Z");
    updateTeamName.mockResolvedValue({
      ...existing,
      name: "Billing",
      modifiedAt: later,
    });
    countTeamReferences.mockResolvedValue({ ticketCount: 0, epicCount: 0 });

    const view = await service.renameTeam("t1", { name: "Billing" }, fakeDb);

    expect(updateTeamName).toHaveBeenCalledWith("t1", "Billing", fakeDb);
    expect(view.name).toBe("Billing");
    expect(view.modifiedAt).toEqual(later);
  });

  it("404s an unknown team", async () => {
    findTeamById.mockResolvedValue(undefined);
    const err = await expectAppError(
      service.renameTeam("missing", { name: "X" }, fakeDb),
    );
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
  });

  it("409s a rename that collides with another team", async () => {
    findTeamById.mockResolvedValue(existing);
    findTeamByName.mockResolvedValue({ id: "other", name: "Billing" });
    const err = await expectAppError(
      service.renameTeam("t1", { name: "Billing" }, fakeDb),
    );
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
    // Uniqueness check excludes self.
    expect(findTeamByName).toHaveBeenCalledWith("Billing", "t1", fakeDb);
  });
});

describe("deleteTeam (unit)", () => {
  it("404s an unknown team", async () => {
    findTeamById.mockResolvedValue(undefined);
    const err = await expectAppError(service.deleteTeam("missing", fakeDb));
    expect(err.code).toBe("NOT_FOUND");
  });

  it("409 TEAM_NOT_EMPTY when the team has tickets or epics", async () => {
    findTeamById.mockResolvedValue({ id: "t1", name: "P" });
    countTeamReferences.mockResolvedValue({ ticketCount: 2, epicCount: 0 });
    const err = await expectAppError(service.deleteTeam("t1", fakeDb));
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
    expect(deleteTeamRepo).not.toHaveBeenCalled();
  });

  it("deletes an empty team", async () => {
    findTeamById.mockResolvedValue({ id: "t1", name: "P" });
    countTeamReferences.mockResolvedValue({ ticketCount: 0, epicCount: 0 });
    deleteTeamRepo.mockResolvedValue(true);
    await expect(service.deleteTeam("t1", fakeDb)).resolves.toBeUndefined();
    expect(deleteTeamRepo).toHaveBeenCalledWith("t1", fakeDb);
  });
});
