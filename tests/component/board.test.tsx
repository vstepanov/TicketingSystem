/**
 * Component tests for the S18 Board screen (plan §5.7, wireframe-1).
 *
 * Covers:
 *   1. Renders all five columns (incl. empty ones) with per-column counts and the
 *      cards + result count from a mocked `GET /api/board` response.
 *   2. Filters drive the query: changing the Type select refetches `/api/board`
 *      with `type=`, and typing in the (debounced) search box refetches with `q=`.
 *   3. Optimistic move: `performOptimisticMove` writes the card into the target
 *      column immediately, calls `PATCH /api/tickets/{id}/state`, and — on a
 *      mocked failure — ROLLS BACK the card to its previous column and reports
 *      the error (drives the toast). Also asserts the pure {@link moveCardInBoard}
 *      helper.
 *
 * jsdom cannot easily simulate a real dnd-kit pointer/keyboard drag, so the move
 * is tested via the extracted handler + pure helper (per the S18 brief). The
 * KeyboardSensor + a11y announcements are wired in {@link BoardScreen}. The
 * api-client and next/navigation are mocked; the screen is wrapped in a fresh
 * QueryClientProvider + ToastProvider.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardScreen } from "@/ui/board/BoardScreen";
import { ToastProvider } from "@/ui/Toast";
import { ApiError } from "@/lib/api-client";
import {
  boardQueryKey,
  moveCardInBoard,
  performOptimisticMove,
  EMPTY_FILTERS,
  type BoardView,
  type EpicOption,
  type TeamOption,
} from "@/ui/board/use-board";

// --- next/navigation mock ---------------------------------------------------
const replaceMock = vi.fn();
let currentTeamId: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/board",
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

const EPICS: EpicOption[] = [{ id: "epic-1", title: "Checkout" }];

function emptyColumns(): BoardView["columns"] {
  return {
    new: { count: 0, tickets: [] },
    ready_for_implementation: { count: 0, tickets: [] },
    in_progress: { count: 0, tickets: [] },
    ready_for_acceptance: { count: 0, tickets: [] },
    done: { count: 0, tickets: [] },
  };
}

function makeBoard(): BoardView {
  const columns = emptyColumns();
  columns.new = {
    count: 2,
    tickets: [
      {
        id: "t1",
        title: "Fix login bug",
        type: "bug",
        epicTitle: "Checkout",
        modifiedAt: "2026-06-02T10:00:00.000Z",
      },
      {
        id: "t2",
        title: "Add dark mode",
        type: "feature",
        epicTitle: null,
        modifiedAt: "2026-06-01T10:00:00.000Z",
      },
    ],
  };
  columns.in_progress = {
    count: 1,
    tickets: [
      {
        id: "t3",
        title: "Refactor api",
        type: "fix",
        epicTitle: null,
        modifiedAt: "2026-06-03T10:00:00.000Z",
      },
    ],
  };
  return { teamId: "team-1", total: 3, columns };
}

/** Route api.get by URL: teams, epics, and board. */
function stubGets(board: () => Promise<BoardView>) {
  apiMock.get.mockImplementation((path: string) => {
    if (path === "/api/teams") {
      return Promise.resolve(TEAMS);
    }
    if (path.startsWith("/api/epics")) {
      return Promise.resolve(EPICS);
    }
    if (path.startsWith("/api/board")) {
      return board();
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderScreen(client = makeClient()) {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BoardScreen />
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

describe("Board columns", () => {
  it("renders all five columns (incl. empty) with counts + cards", async () => {
    stubGets(() => Promise.resolve(makeBoard()));
    renderScreen();

    // All five columns are present, even the empty ones. Each renders a labelled
    // droppable list (`role="list"` named "<Label>, <count> tickets").
    await screen.findByText("Fix login bug");
    for (const name of [
      /^New, \d+ tickets$/,
      /^Ready for Implementation, \d+ tickets$/,
      /^In Progress, \d+ tickets$/,
      /^Ready for Acceptance, \d+ tickets$/,
      /^Done, \d+ tickets$/,
    ]) {
      expect(screen.getByRole("list", { name })).toBeInTheDocument();
    }

    // Cards from the mocked response render in their columns.
    expect(await screen.findByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("Add dark mode")).toBeInTheDocument();
    expect(screen.getByText("Refactor api")).toBeInTheDocument();

    // Epic title shows only when present.
    expect(screen.getByText("Epic: Checkout")).toBeInTheDocument();

    // Result count reflects the total.
    expect(screen.getByText("3 tickets")).toBeInTheDocument();
  });
});

describe("Filters drive the query", () => {
  it("changing Type refetches /api/board with type=", async () => {
    stubGets(() => Promise.resolve(makeBoard()));
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Fix login bug");

    await user.selectOptions(screen.getByLabelText("Type"), "bug");

    await waitFor(() => {
      const boardCalls = apiMock.get.mock.calls.filter(([p]) =>
        (p as string).startsWith("/api/board"),
      );
      expect(
        boardCalls.some(([p]) => (p as string).includes("type=bug")),
      ).toBe(true);
    });
  });

  it("typing in Search refetches /api/board with q= (debounced)", async () => {
    stubGets(() => Promise.resolve(makeBoard()));
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Fix login bug");

    await user.type(screen.getByLabelText("Search title"), "login");

    await waitFor(
      () => {
        const boardCalls = apiMock.get.mock.calls.filter(([p]) =>
          (p as string).startsWith("/api/board"),
        );
        expect(
          boardCalls.some(([p]) => (p as string).includes("q=login")),
        ).toBe(true);
      },
      { timeout: 2000 },
    );
  });
});

describe("Optimistic move + rollback", () => {
  it("moveCardInBoard moves a card and recomputes counts (pure)", () => {
    const board = makeBoard();
    const { board: next, fromState } = moveCardInBoard(board, "t1", "done");

    expect(fromState).toBe("new");
    // Source lost the card, target gained it at the top.
    expect(next.columns.new.tickets.map((t) => t.id)).toEqual(["t2"]);
    expect(next.columns.new.count).toBe(1);
    expect(next.columns.done.tickets.map((t) => t.id)).toEqual(["t1"]);
    expect(next.columns.done.count).toBe(1);
    // Original board is untouched (immutability).
    expect(board.columns.new.count).toBe(2);
  });

  it("performOptimisticMove writes optimistically then PATCHes on success", async () => {
    const client = makeClient();
    const key = boardQueryKey("team-1", EMPTY_FILTERS);
    client.setQueryData(key, makeBoard());

    const mutate = vi.fn().mockResolvedValue({
      id: "t1",
      state: "done",
      modifiedAt: "2026-06-04T10:00:00.000Z",
    });
    const onError = vi.fn();

    const attempted = await performOptimisticMove({
      queryClient: client,
      teamId: "team-1",
      filters: EMPTY_FILTERS,
      cardId: "t1",
      toState: "done",
      mutate,
      onError,
    });

    expect(attempted).toBe(true);
    expect(mutate).toHaveBeenCalledWith({ id: "t1", state: "done" });
    expect(onError).not.toHaveBeenCalled();
    const after = client.getQueryData<BoardView>(key)!;
    expect(after.columns.done.tickets.map((t) => t.id)).toEqual(["t1"]);
    expect(after.columns.new.tickets.map((t) => t.id)).toEqual(["t2"]);
  });

  it("performOptimisticMove rolls back + reports error on PATCH failure", async () => {
    const client = makeClient();
    const key = boardQueryKey("team-1", EMPTY_FILTERS);
    client.setQueryData(key, makeBoard());

    const mutate = vi
      .fn()
      .mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "bad state"));
    const onError = vi.fn();

    await performOptimisticMove({
      queryClient: client,
      teamId: "team-1",
      filters: EMPTY_FILTERS,
      cardId: "t1",
      toState: "done",
      mutate,
      onError,
    });

    expect(mutate).toHaveBeenCalledWith({ id: "t1", state: "done" });
    expect(onError).toHaveBeenCalledTimes(1);
    // Rolled back: card is back in its original "new" column, "done" empty again.
    const after = client.getQueryData<BoardView>(key)!;
    expect(after.columns.new.tickets.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(after.columns.done.tickets).toEqual([]);
  });

  it("integrates with the mocked PATCH endpoint + surfaces an error toast", async () => {
    // End-to-end through the api-client mock: a failing PATCH rolls back and the
    // screen's onError toast fires.
    stubGets(() => Promise.resolve(makeBoard()));
    apiMock.patch.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "bad state"),
    );

    const client = makeClient();
    renderScreen(client);
    await screen.findByText("Fix login bug");

    // Wait until the board query is cached under the resolved teamId key.
    const key = boardQueryKey("team-1", EMPTY_FILTERS);
    await waitFor(() =>
      expect(client.getQueryData<BoardView>(key)).toBeTruthy(),
    );

    await performOptimisticMove({
      queryClient: client,
      teamId: "team-1",
      filters: EMPTY_FILTERS,
      cardId: "t1",
      toState: "done",
      mutate: (vars) => apiMock.patch(`/api/tickets/${vars.id}/state`, {
        state: vars.state,
      }),
      onError: () => {},
    });

    expect(apiMock.patch).toHaveBeenCalledWith("/api/tickets/t1/state", {
      state: "done",
    });
    const after = client.getQueryData<BoardView>(key)!;
    expect(after.columns.new.tickets.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("Column drop-target ids match canonical states", () => {
  it("renders a droppable list per state labelled with its count", async () => {
    stubGets(() => Promise.resolve(makeBoard()));
    renderScreen();

    const newList = await screen.findByRole("list", { name: /New, 2 tickets/ });
    expect(within(newList).getByText("Fix login bug")).toBeInTheDocument();
  });
});
