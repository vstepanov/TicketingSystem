/**
 * Component tests for the S19 ticket create / detail screens + comments panel
 * (plan §5.8, §5.9, wireframe-3).
 *
 * Covers:
 *   1. Create form POSTs with the selected values (team/type/state/epic/title/body)
 *      and navigates to the new ticket's detail page on 201.
 *   2. Changing the team on the create form CLEARS the epic selection and
 *      re-queries epics for the new team.
 *   3. The detail screen prefills the form from the loaded ticket and PATCHes the
 *      current values on Save.
 *   4. Delete → confirm dialog → DELETE + navigate to /board.
 *   5. Comments render oldest-first; posting calls POST and refetches the list.
 *   6. A 404 on the ticket load shows a friendly "Ticket not found".
 *
 * The api-client is mocked so no real network happens; `next/navigation` is
 * mocked. Screens are wrapped in a fresh QueryClientProvider + ToastProvider.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateTicketScreen } from "@/ui/tickets/CreateTicketScreen";
import { TicketDetailScreen } from "@/ui/tickets/TicketDetailScreen";
import { ToastProvider } from "@/ui/Toast";
import { ApiError } from "@/lib/api-client";
import type {
  Comment,
  TeamOption,
  TicketDetail,
} from "@/ui/tickets/use-ticket";

// --- next/navigation mock ---------------------------------------------------
const pushMock = vi.fn();
let currentTeamId: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => "/tickets/new",
  useSearchParams: () => ({
    get: (key: string) => (key === "teamId" ? currentTeamId : null),
    toString: () => (currentTeamId ? `teamId=${currentTeamId}` : ""),
  }),
}));

// --- next/link mock (render a plain anchor) ---------------------------------
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
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

const EPICS_TEAM_1 = [
  { id: "epic-1a", title: "Checkout" },
  { id: "epic-1b", title: "Refunds" },
];
const EPICS_TEAM_2 = [{ id: "epic-2a", title: "Infra" }];

function makeTicket(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: "t-1",
    teamId: "team-1",
    epicId: "epic-1a",
    type: "bug",
    state: "in_progress",
    title: "Login is broken",
    body: "Steps to reproduce…",
    createdBy: "u-1",
    createdAt: "2026-01-01T10:00:00.000Z",
    modifiedAt: "2026-01-02T12:30:00.000Z",
    authorEmail: "author@example.com",
    epicTitle: "Checkout",
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c-1",
    author: { id: "u-1", email: "commenter@example.com" },
    body: "First comment",
    createdAt: "2026-01-01T11:00:00.000Z",
    ...overrides,
  };
}

function stubCreateGets() {
  apiMock.get.mockImplementation((path: string) => {
    if (path === "/api/teams") {
      return Promise.resolve(TEAMS);
    }
    if (path === "/api/epics?teamId=team-1") {
      return Promise.resolve(EPICS_TEAM_1);
    }
    if (path === "/api/epics?teamId=team-2") {
      return Promise.resolve(EPICS_TEAM_2);
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

function renderCreate() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CreateTicketScreen />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function renderDetail(ticketId = "t-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TicketDetailScreen ticketId={ticketId} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentTeamId = null;
  pushMock.mockReset();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Create ticket", () => {
  it("POSTs the selected values and navigates to the new ticket", async () => {
    stubCreateGets();
    apiMock.post.mockResolvedValue({ id: "t-new" });

    const user = userEvent.setup();
    renderCreate();

    // Team defaults to the first team; wait for the form heading.
    await screen.findByRole("heading", { name: "New ticket" });

    // Pick type=feature, state=done, epic=Refunds, and fill title/body.
    await user.selectOptions(screen.getByLabelText("Type"), "feature");
    await user.selectOptions(screen.getByLabelText("State"), "done");
    // Epic options for team-1 are loaded.
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Refunds" })).toBeInTheDocument(),
    );
    await user.selectOptions(screen.getByLabelText("Epic (optional)"), "epic-1b");
    await user.type(screen.getByLabelText("Title"), "New bug");
    await user.type(screen.getByLabelText("Body"), "Details here");

    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith("/api/tickets", {
        teamId: "team-1",
        type: "feature",
        state: "done",
        epicId: "epic-1b",
        title: "New bug",
        body: "Details here",
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/tickets/t-new");
    });
  });

  it("clears the epic selection when the team changes", async () => {
    stubCreateGets();

    const user = userEvent.setup();
    renderCreate();

    await screen.findByRole("heading", { name: "New ticket" });

    // Select an epic from team-1.
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Checkout" })).toBeInTheDocument(),
    );
    const epicSelect = screen.getByLabelText("Epic (optional)") as HTMLSelectElement;
    await user.selectOptions(epicSelect, "epic-1a");
    expect(epicSelect.value).toBe("epic-1a");

    // Switch the team → epic must reset to "None" and new epics load.
    await user.selectOptions(screen.getByLabelText("Team"), "team-2");

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith("/api/epics?teamId=team-2");
    });
    // Epic selection cleared (value is the None sentinel = "").
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Epic (optional)") as HTMLSelectElement).value,
      ).toBe(""),
    );
    // The old epic option is gone; the new team's epic is present.
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Infra" })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("option", { name: "Checkout" }),
    ).not.toBeInTheDocument();
  });

  it("shows inline required-field errors when title/body are empty", async () => {
    stubCreateGets();
    const user = userEvent.setup();
    renderCreate();

    await screen.findByRole("heading", { name: "New ticket" });
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Body is required.")).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe("Ticket detail (edit)", () => {
  function stubDetailGets(ticket: TicketDetail, comments: Comment[] = []) {
    apiMock.get.mockImplementation((path: string) => {
      if (path === "/api/teams") {
        return Promise.resolve(TEAMS);
      }
      if (path === `/api/tickets/${ticket.id}`) {
        return Promise.resolve(ticket);
      }
      if (path === `/api/tickets/${ticket.id}/comments`) {
        return Promise.resolve(comments);
      }
      if (path === "/api/epics?teamId=team-1") {
        return Promise.resolve(EPICS_TEAM_1);
      }
      if (path === "/api/epics?teamId=team-2") {
        return Promise.resolve(EPICS_TEAM_2);
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
  }

  it("prefills the form and PATCHes on save", async () => {
    stubDetailGets(makeTicket());
    apiMock.patch.mockResolvedValue(makeTicket({ title: "Login is fixed" }));

    const user = userEvent.setup();
    renderDetail();

    // Prefilled: heading is the ticket title; meta line shows author + UTC.
    expect(
      await screen.findByRole("heading", { name: "Login is broken" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/author@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Modified Jan 2, 12:30 UTC/)).toBeInTheDocument();

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    expect(title.value).toBe("Login is broken");

    await user.clear(title);
    await user.type(title, "Login is fixed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith("/api/tickets/t-1", {
        teamId: "team-1",
        type: "bug",
        state: "in_progress",
        epicId: "epic-1a",
        title: "Login is fixed",
        body: "Steps to reproduce…",
      });
    });
  });

  it("confirms delete then DELETEs and navigates to /board", async () => {
    stubDetailGets(makeTicket());
    apiMock.delete.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole("heading", { name: "Login is broken" });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(apiMock.delete).toHaveBeenCalledWith("/api/tickets/t-1");
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/board");
    });
  });

  it("shows a friendly message when the ticket is not found (404)", async () => {
    apiMock.get.mockImplementation((path: string) => {
      if (path === "/api/teams") {
        return Promise.resolve(TEAMS);
      }
      if (path === "/api/tickets/missing") {
        return Promise.reject(new ApiError(404, "NOT_FOUND", "Ticket not found"));
      }
      if (path === "/api/tickets/missing/comments") {
        return Promise.reject(new ApiError(404, "NOT_FOUND", "Ticket not found"));
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    renderDetail("missing");

    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
  });
});

describe("Comments panel", () => {
  function stubDetailGets(ticket: TicketDetail, comments: () => Promise<Comment[]>) {
    apiMock.get.mockImplementation((path: string) => {
      if (path === "/api/teams") {
        return Promise.resolve(TEAMS);
      }
      if (path === `/api/tickets/${ticket.id}`) {
        return Promise.resolve(ticket);
      }
      if (path === `/api/tickets/${ticket.id}/comments`) {
        return comments();
      }
      if (path.startsWith("/api/epics")) {
        return Promise.resolve(EPICS_TEAM_1);
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
  }

  it("renders comments oldest-first (server order preserved)", async () => {
    stubDetailGets(makeTicket(), () =>
      Promise.resolve([
        makeComment({ id: "c-1", body: "Oldest" }),
        makeComment({ id: "c-2", body: "Newest" }),
      ]),
    );

    renderDetail();

    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // Order is exactly as returned (oldest first).
    expect(items[0]).toHaveTextContent("Oldest");
    expect(items[1]).toHaveTextContent("Newest");
  });

  it("posts a comment and refetches the list", async () => {
    let call = 0;
    stubDetailGets(makeTicket(), () => {
      call += 1;
      return Promise.resolve(
        call <= 1
          ? [makeComment({ id: "c-1", body: "Oldest" })]
          : [
              makeComment({ id: "c-1", body: "Oldest" }),
              makeComment({ id: "c-2", body: "Fresh comment" }),
            ],
      );
    });
    apiMock.post.mockResolvedValue(makeComment({ id: "c-2", body: "Fresh comment" }));

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Oldest");

    await user.type(screen.getByLabelText("Add comment"), "Fresh comment");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith("/api/tickets/t-1/comments", {
        body: "Fresh comment",
      });
    });
    // Refetched: the new comment appears.
    expect(await screen.findByText("Fresh comment")).toBeInTheDocument();
    // Posting a comment must NOT PATCH/refetch the ticket (server guarantees the
    // ticket is unchanged); the ticket GET happened once (initial load).
    const ticketGets = apiMock.get.mock.calls.filter(
      ([p]) => p === "/api/tickets/t-1",
    );
    expect(ticketGets).toHaveLength(1);
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it("shows an inline error when posting an empty comment", async () => {
    stubDetailGets(makeTicket(), () => Promise.resolve([]));

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("No comments yet.");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    expect(
      await screen.findByText("Comment cannot be empty"),
    ).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
