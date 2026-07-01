/**
 * Component tests for the S15 verify-result screen (plan §5.6).
 *
 * Covers:
 *   1. Success: token in URL → POST /api/auth/verify 200 → "Email verified" +
 *      Continue to login.
 *   2. Expired/invalid: 410 → "Expired or invalid link" + a Resend action that
 *      POSTs /api/auth/resend-verification.
 *   3. Missing token → error panel without any verify network call.
 *
 * `next/navigation` (useSearchParams) and `next/link` are mocked; `fetch` stubbed.
 * The search params are configurable per test via a module-level ref.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VerifyPage from "../../app/verify/page";
import { setUnauthorizedHandler } from "@/lib/api-client";

let currentToken: string | null = null;

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? currentToken : null),
  }),
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

beforeEach(() => {
  currentToken = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
  vi.clearAllMocks();
});

describe("verify success", () => {
  it("verifies a token and shows the success panel", async () => {
    currentToken = "good-token";
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith("/api/auth/verify")) {
        expect(String(init?.body)).toContain("good-token");
        return jsonResponse(200, { verified: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<VerifyPage />);

    expect(await screen.findByText("Email verified")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to login" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("verify expired", () => {
  it("shows the expired panel and can resend a new email", async () => {
    currentToken = "expired-token";
    const fetchMock = stubFetch((url) => {
      if (url.endsWith("/api/auth/verify")) {
        return jsonResponse(410, {
          error: {
            code: "TOKEN_EXPIRED_OR_INVALID",
            message: "Token expired or invalid",
          },
        });
      }
      if (url.endsWith("/api/auth/resend-verification")) {
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    render(<VerifyPage />);

    expect(
      await screen.findByText("Expired or invalid link"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Resend email" }));

    expect(
      await screen.findByText(/a new verification link is on its way/i),
    ).toBeInTheDocument();
    const resendCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/auth/resend-verification"),
    );
    expect(resendCall).toBeTruthy();
  });
});

describe("verify missing token", () => {
  it("shows the error panel without calling verify", async () => {
    currentToken = null;
    const fetchMock = stubFetch(() => {
      throw new Error("verify should not be called without a token");
    });
    render(<VerifyPage />);

    expect(
      await screen.findByText("Expired or invalid link"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This verification link is missing its token."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
