/**
 * Component tests for the S16 Teams screen (plan §5.10, wireframe-4).
 *
 * Covers:
 *   1. Renders the team list with ticket & epic counts.
 *   2. Create with a duplicate name (409) shows the inline "A team with that
 *      name already exists." message.
 *   3. Delete button is disabled when `canDelete` is false (team referenced) and
 *      enabled otherwise.
 *   4. Confirming delete calls DELETE and the list refetches.
 *
 * The api-client is mocked so no real network happens; the screen is wrapped in
 * a fresh QueryClientProvider + ToastProvider via a test helper.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeamsScreen } from "@/ui/teams/TeamsScreen";
import { ToastProvider } from "@/ui/Toast";
import { ApiError } from "@/lib/api-client";
import type { Team } from "@/ui/teams/use-teams";

// Mock the api-client transport. `api.get/post/patch/delete` are stubbed per test.
const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>(
    "@/lib/api-client",
  );
  return {
    ...actual,
    api: {
      get: (...args: unknown[]) => apiMock.get(...args),
      post: (...args: unknown[]) => apiMock.post(...args),
      patch: (...args: unknown[]) => apiMock.patch(...args),
      delete: (...args: unknown[]) => apiMock.delete(...args),
    },
  };
});

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    name: "Payments",
    createdAt: "2026-01-01T10:00:00.000Z",
    modifiedAt: "2026-01-02T12:00:00.000Z",
    ticketCount: 0,
    epicCount: 0,
    canDelete: true,
    ...overrides,
  };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TeamsScreen />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Teams list", () => {
  it("renders teams with ticket and epic counts", async () => {
    apiMock.get.mockResolvedValue([
      makeTeam({ id: "t1", name: "Payments", ticketCount: 3, epicCount: 2 }),
      makeTeam({ id: "t2", name: "Platform", ticketCount: 0, epicCount: 0 }),
    ]);

    renderScreen();

    const paymentsCell = await screen.findByText("Payments");
    const row = paymentsCell.closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText("3")).toBeInTheDocument();
    expect(cells.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Platform")).toBeInTheDocument();
  });

  it("shows the empty state when there are no teams", async () => {
    apiMock.get.mockResolvedValue([]);
    renderScreen();
    expect(
      await screen.findByText("No teams yet — create your first team."),
    ).toBeInTheDocument();
  });
});

describe("Create team", () => {
  it("shows the duplicate message on 409", async () => {
    apiMock.get.mockResolvedValue([]);
    apiMock.post.mockRejectedValue(
      new ApiError(409, "CONFLICT", "Team name already exists"),
    );

    const user = userEvent.setup();
    renderScreen();

    // Open the create panel (top button).
    await user.click(
      (await screen.findAllByRole("button", { name: "+ Create team" }))[0],
    );

    await user.type(screen.getByLabelText("Team name"), "Payments");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(
      await screen.findByText("A team with that name already exists."),
    ).toBeInTheDocument();
  });
});

describe("Delete team", () => {
  it("disables delete when the team is referenced and enables it otherwise", async () => {
    apiMock.get.mockResolvedValue([
      makeTeam({ id: "t1", name: "Payments", ticketCount: 4, canDelete: false }),
      makeTeam({ id: "t2", name: "Empty", ticketCount: 0, epicCount: 0, canDelete: true }),
    ]);

    renderScreen();

    const referencedRow = (await screen.findByText("Payments")).closest("tr");
    const emptyRow = screen.getByText("Empty").closest("tr");

    const referencedDelete = within(referencedRow as HTMLElement).getByRole(
      "button",
      { name: "Delete" },
    );
    const emptyDelete = within(emptyRow as HTMLElement).getByRole("button", {
      name: "Delete",
    });

    expect(referencedDelete).toBeDisabled();
    expect(emptyDelete).toBeEnabled();
  });

  it("confirms and calls DELETE, then refetches the list", async () => {
    apiMock.get
      .mockResolvedValueOnce([
        makeTeam({ id: "t2", name: "Empty", canDelete: true }),
      ])
      .mockResolvedValueOnce([]);
    apiMock.delete.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderScreen();

    const emptyRow = (await screen.findByText("Empty")).closest("tr");
    await user.click(
      within(emptyRow as HTMLElement).getByRole("button", { name: "Delete" }),
    );

    // Confirm in the dialog.
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(apiMock.delete).toHaveBeenCalledWith("/api/teams/t2");
    });
    // Refetch happened (initial load + post-delete invalidation).
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledTimes(2);
    });
  });
});
