/**
 * Component tests for the S15 sign-up screen (plan §5.4).
 *
 * Covers:
 *   1. Client validation blocks submit (short password, password mismatch) with
 *      inline messages and NO network call.
 *   2. Happy path: valid input POSTs /api/auth/signup and shows the
 *      "check your email" success state (no auto-login).
 *   3. 409 → generic "account may already exist" message.
 *
 * `next/navigation` and `next/link` are mocked; global `fetch` is stubbed.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SignupPage from "../../app/signup/page";
import { setUnauthorizedHandler } from "@/lib/api-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
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

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
  vi.clearAllMocks();
});

describe("signup validation", () => {
  it("blocks submit on short password and shows an inline error", async () => {
    const fetchMock = stubFetch(() => {
      throw new Error("fetch should not be called");
    });
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(
      await screen.findByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks submit when passwords do not match", async () => {
    const fetchMock = stubFetch(() => {
      throw new Error("fetch should not be called");
    });
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password124");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("signup success", () => {
  it("shows the check-your-email state after a 201", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.endsWith("/api/auth/signup")) {
        return jsonResponse(201, {
          id: "u1",
          email: "alice@example.com",
          emailVerified: false,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText(/verification link/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // No auto-login: no session bootstrap / redirect happened.
    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
  });
});

describe("signup conflict", () => {
  it("shows a generic message on 409", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/auth/signup")) {
        return jsonResponse(409, {
          error: { code: "CONFLICT", message: "Email already registered" },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(
      await screen.findByText("An account with this email may already exist."),
    ).toBeInTheDocument();
  });
});
