/**
 * Component tests for the S15 login screen (plan §5.5).
 *
 * Covers:
 *   1. 401 → generic "Incorrect email or password" (no resend block).
 *   2. 403 ACCOUNT_NOT_VERIFIED → reveals the "Resend email" action, which POSTs
 *      /api/auth/resend-verification and shows a generic success message.
 *   3. Success (200) → redirects to /board.
 *
 * `next/navigation` (useRouter) and `next/link` are mocked; `fetch` is stubbed.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "../../app/login/page";
import { setUnauthorizedHandler } from "@/lib/api-client";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

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

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(typeof input === "string" ? input : input.toString(), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Anonymous session response for the on-mount `/api/auth/me` check. */
function anonMe(url: string): Response | null {
  if (url.endsWith("/api/auth/me")) {
    return jsonResponse(401, {
      error: { code: "UNAUTHENTICATED", message: "No session" },
    });
  }
  return null;
}

async function fillCreds(user: ReturnType<typeof userEvent.setup>) {
  // The form renders only after the on-mount session check resolves (anon).
  await user.type(await screen.findByLabelText("Email"), "alice@example.com");
  await user.type(screen.getByLabelText("Password"), "password123");
}

beforeEach(() => {
  replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
  vi.clearAllMocks();
});

describe("login errors", () => {
  it("shows a generic message on 401 without revealing resend", async () => {
    stubFetch((url) => {
      const me = anonMe(url);
      if (me) return me;
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse(401, {
          error: { code: "UNAUTHENTICATED", message: "Invalid credentials" },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillCreds(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByText("Incorrect email or password."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resend email" }),
    ).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("login unverified", () => {
  it("reveals the resend block on 403 and resends the email", async () => {
    const fetchMock = stubFetch((url) => {
      const me = anonMe(url);
      if (me) return me;
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse(403, {
          error: {
            code: "ACCOUNT_NOT_VERIFIED",
            message: "Account not verified",
          },
        });
      }
      if (url.endsWith("/api/auth/resend-verification")) {
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillCreds(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const resendButton = await screen.findByRole("button", {
      name: "Resend email",
    });
    expect(screen.getByText("Your account isn't verified yet.")).toBeInTheDocument();

    await user.click(resendButton);

    expect(
      await screen.findByText(/a new verification link is on its way/i),
    ).toBeInTheDocument();
    // The resend request carried the entered email.
    const resendCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/auth/resend-verification"),
    );
    expect(resendCall).toBeTruthy();
    expect(String(resendCall?.[1]?.body)).toContain("alice@example.com");
  });
});

describe("login success", () => {
  it("redirects to /board on 200", async () => {
    stubFetch((url) => {
      const me = anonMe(url);
      if (me) return me;
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse(200, { id: "u1", email: "alice@example.com" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillCreds(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/board");
    });
  });
});

describe("login when already authenticated", () => {
  it("redirects to /board without showing the form", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse(200, {
          id: "u1",
          email: "alice@example.com",
          emailVerified: true,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<LoginPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/board");
    });
    // The login form was never shown to the authenticated visitor.
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
});
