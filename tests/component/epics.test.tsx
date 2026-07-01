/**
 * Component tests for the S17 Epics screen (plan §5.11, wireframe-5).
 *
 * Covers:
 *   1. Renders epics for the selected team (list scoped to teamId).
 *   2. Create posts with the selected teamId (team taken from the selector).
 *   3. The edit panel has NO team field (team is immutable on edit).
 *   4. Delete is disabled when the epic is referenced (canDelete=false) and
 *      enabled otherwise; confirming enabled delete calls DELETE and refetches.
 *
 * The api-client is mocked so no real network happens; `next/navigation` is
 * mocked (the screen mirrors the teamId to the URL). The screen is wrapped in a
 * fresh QueryClientProvider + ToastProvider.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EpicsScreen } from "@/ui/epics/EpicsScreen";
import { ToastProvider } from "@/ui/Toast";
import { ApiError } from "@/lib/api-client";
import type { Epic, TeamOption } from "@/ui/epics/use-epics";

// --- next/navigation mock ---------------------------------------------------
const replaceMock = vi.fn();
let currentTeamId: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/epics",
  useSearchParams: () => ({
    get: (key: string) => (key === "teamId" ? currentTeamId : null),
    toString: () => (currentTeamId ? `teamId=${currentTeamId}` : ""),
  }),
}));

// --- api-client mock --------------------------------------------------------
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

const TEAMS: TeamOption[] = [
  { id: "team-1", name: "Payments" },
  { id: "team-2", name: "Platform" },
];

function makeEpic(overrides: Partial<Epic> = {}): Epic {
  return {
    id: "e1",
    teamId: "team-1",
    title: "Checkout",
    description: "The checkout epic",
    createdAt: "2026-01-01T10:00:00.000Z",
    modifiedAt: "2026-01-02T12:00:00.000Z",
    ticketCount: 0,
    canDelete: true,
    ...overrides,
  };
}

/**
 * Route api.get by URL: `/api/teams` returns TEAMS; `/api/epics?teamId=` returns
 * whatever `epics` resolves to.
 */
function stubGets(epics: () => Promise<Epic[]>) {
  apiMock.get.mockImplementation((path: string) => {
    if (path === "/api/teams") {
      return Promise.resolve(TEAMS);
    }
    if (path.startsWith("/api/epics")) {
      return epics();
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <EpicsScreen />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentTeamId = null;
  replaceMock.mockReset();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Epics list", () => {
  it("renders epics for the selected (default first) team", async () => {
    stubGets(() =>
      Promise.resolve([
        makeEpic({ id: "e1", title: "Checkout", ticketCount: 3 }),
        makeEpic({ id: "e2", title: "Refunds", ticketCount: 0 }),
      ]),
    );

    renderScreen();

    expect(await screen.findByText("Checkout")).toBeInTheDocument();
    expect(screen.getByText("Refunds")).toBeInTheDocument();
    // Scoped to the default first team.
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith(
        "/api/epics?teamId=team-1",
      );
    });
  });

  it("shows the empty state when the team has no epics", async () => {
    stubGets(() => Promise.resolve([]));
    renderScreen();
    expect(
      await screen.findByText("No epics for this team yet."),
    ).toBeInTheDocument();
  });
});

describe("Create epic", () => {
  it("posts with the selected teamId", async () => {
    stubGets(() => Promise.resolve([]));
    apiMock.post.mockResolvedValue(makeEpic({ id: "new", title: "Billing" }));

    const user = userEvent.setup();
    renderScreen();

    // Wait for teams to resolve + empty state.
    await screen.findByText("No epics for this team yet.");

    // Open the create panel via the header toggle (first "+ Create epic").
    await user.click(
      screen.getAllByRole("button", { name: "+ Create epic" })[0],
    );

    await user.type(screen.getByLabelText("Title"), "Billing");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith("/api/epics", {
        teamId: "team-1",
        title: "Billing",
        description: null,
      });
    });
  });
});

describe("Edit epic (team immutable)", () => {
  it("edit panel has no team field/selector", async () => {
    stubGets(() =>
      Promise.resolve([makeEpic({ id: "e1", title: "Checkout" })]),
    );

    const user = userEvent.setup();
    renderScreen();

    const row = (await screen.findByText("Checkout")).closest("tr");
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "Edit" }),
    );

    const editForm = await screen.findByRole("form", { name: "Edit epic" });
    // Title + Description are editable...
    expect(within(editForm).getByLabelText("Title")).toBeInTheDocument();
    expect(
      within(editForm).getByLabelText("Description (optional)"),
    ).toBeInTheDocument();
    // ...but there is NO "Team" form control (team is immutable on edit).
    expect(
      within(editForm).queryByLabelText("Team"),
    ).not.toBeInTheDocument();
    expect(
      within(editForm).queryByRole("combobox"),
    ).not.toBeInTheDocument();
  });

  it("saves title/description without sending teamId", async () => {
    stubGets(() =>
      Promise.resolve([makeEpic({ id: "e1", title: "Checkout" })]),
    );
    apiMock.patch.mockResolvedValue(makeEpic({ id: "e1", title: "Checkout v2" }));

    const user = userEvent.setup();
    renderScreen();

    const row = (await screen.findByText("Checkout")).closest("tr");
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "Edit" }),
    );

    const editForm = await screen.findByRole("form", { name: "Edit epic" });
    const title = within(editForm).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Checkout v2");
    await user.click(within(editForm).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith("/api/epics/e1", {
        title: "Checkout v2",
        description: "The checkout epic",
      });
    });
    // The PATCH body must not include teamId (team immutable).
    const [, body] = apiMock.patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty("teamId");
  });
});

describe("Delete epic", () => {
  it("disables delete when referenced and enables it otherwise", async () => {
    stubGets(() =>
      Promise.resolve([
        makeEpic({ id: "e1", title: "Referenced", ticketCount: 4, canDelete: false }),
        makeEpic({ id: "e2", title: "Free", ticketCount: 0, canDelete: true }),
      ]),
    );

    renderScreen();

    const referencedRow = (await screen.findByText("Referenced")).closest("tr");
    const freeRow = screen.getByText("Free").closest("tr");

    expect(
      within(referencedRow as HTMLElement).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();
    expect(
      within(freeRow as HTMLElement).getByRole("button", { name: "Delete" }),
    ).toBeEnabled();
  });

  it("confirms and calls DELETE, then refetches the list", async () => {
    let call = 0;
    stubGets(() => {
      call += 1;
      // First epics fetch returns one deletable epic; later fetches return [].
      return Promise.resolve(
        call <= 1 ? [makeEpic({ id: "e2", title: "Free", canDelete: true })] : [],
      );
    });
    apiMock.delete.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderScreen();

    const row = (await screen.findByText("Free")).closest("tr");
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "Delete" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(apiMock.delete).toHaveBeenCalledWith("/api/epics/e2");
    });
    // Refetch happened: at least the teams GET + two epics GETs.
    await waitFor(() => {
      const epicGets = apiMock.get.mock.calls.filter(([p]) =>
        (p as string).startsWith("/api/epics"),
      );
      expect(epicGets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows a clear message on 409 EPIC_REFERENCED (race)", async () => {
    stubGets(() =>
      Promise.resolve([makeEpic({ id: "e2", title: "Free", canDelete: true })]),
    );
    apiMock.delete.mockRejectedValue(
      new ApiError(409, "CONFLICT", "Epic is referenced"),
    );

    const user = userEvent.setup();
    renderScreen();

    const row = (await screen.findByText("Free")).closest("tr");
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "Delete" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText(
        "Epic is referenced by tickets and can't be deleted.",
      ),
    ).toBeInTheDocument();
  });
});
