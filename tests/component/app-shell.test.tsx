/**
 * Component tests for the S14 app shell (plan §5.1-5.3).
 *
 * Covers the acceptance criteria:
 *   1. Route guard: an anonymous visitor (GET /api/auth/me → 401) is redirected
 *      to /login and the shell is not rendered.
 *   2. Authenticated shell renders the brand, nav tabs, and the user's email.
 *   3. UserMenu "Log out" calls POST /api/auth/logout then redirects to /login.
 *
 * `next/navigation` and global `fetch` are mocked. The `(app)` layout is
 * reconstructed from its building blocks (AuthProvider + AppShell) so we test
 * the same composition the route group renders.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/ui/AppShell";
import { setUnauthorizedHandler } from "@/lib/api-client";

// --- next/navigation mock --------------------------------------------------
const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, prefetch: vi.fn() }),
  usePathname: () => "/board",
}));

// --- next/link mock (render a plain anchor) --------------------------------
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function mockFetchOnce(handler: (input: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderShell() {
  return render(
    <AuthProvider requireAuth>
      <AppShell>
        <div>Board content</div>
      </AppShell>
    </AuthProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("app shell auth guard", () => {
  it("redirects an anonymous visitor to /login when /me returns 401", async () => {
    mockFetchOnce((url) => {
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse(401, {
          error: { code: "UNAUTHENTICATED", message: "Authentication required" },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderShell();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    // Shell chrome must not render for an anonymous visitor.
    expect(screen.queryByText("TICKET TRACKER")).not.toBeInTheDocument();
    expect(screen.queryByText("Board content")).not.toBeInTheDocument();
  });
});

describe("authenticated app shell", () => {
  it("renders brand, nav tabs, and the user email", async () => {
    mockFetchOnce((url) => {
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse(200, {
          id: "u1",
          email: "alice@example.com",
          emailVerified: true,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderShell();

    // Brand + nav appear once the user is loaded.
    expect(await screen.findByText("TICKET TRACKER")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Board" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Teams" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Epics" })).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Board content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("user menu logout", () => {
  it("posts to /api/auth/logout and redirects to /login", async () => {
    const fetchMock = mockFetchOnce((url, init) => {
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse(200, {
          id: "u1",
          email: "alice@example.com",
          emailVerified: true,
        });
      }
      if (url.endsWith("/api/auth/logout")) {
        expect(init?.method).toBe("POST");
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderShell();

    // Open the user menu (trigger shows the email).
    const trigger = await screen.findByRole("button", { name: /alice@example.com/ });
    await user.click(trigger);

    const logoutItem = await screen.findByRole("menuitem", { name: "Log out" });
    await user.click(logoutItem);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).endsWith("/api/auth/logout"),
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
  });
});
