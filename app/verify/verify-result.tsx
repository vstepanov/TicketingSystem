"use client";

/**
 * Verify result inner component (plan §5.6).
 *
 * On mount it reads `token` from the query and POSTs `/api/auth/verify`. States:
 *   - `verifying` — "Verifying…" spinner (also covers a missing token briefly);
 *   - `success` — "Email verified" + Continue to login;
 *   - `error` — missing token or 400/410 → "Expired or invalid link" + a Resend
 *     action that asks for an email and POSTs `/api/auth/resend-verification`
 *     (generic success, handles 429).
 *
 * Client validation is UX-only; the backend is authoritative (§11.7).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api, isApiError } from "@/lib/api-client";
import { validateEmail } from "@/lib/auth-validation";
import {
  AuthCard,
  Button,
  Spinner,
  TextField,
} from "@/ui";

type Status = "verifying" | "success" | "error";

const LINK_STYLE = {
  display: "block",
  marginTop: "var(--space-5)",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
} as const;

export function VerifyResult() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resend sub-form (shown on the error panel).
  const [resendEmail, setResendEmail] = useState("");
  const [resendEmailError, setResendEmailError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Guard against React 18/19 strict-mode double-invoke firing verify twice.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    if (!token || token.trim().length === 0) {
      setStatus("error");
      setErrorMessage("This verification link is missing its token.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await api.post("/api/auth/verify", { token });
        if (!cancelled) {
          setStatus("success");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setStatus("error");
        if (isApiError(error) && (error.status === 410 || error.status === 400)) {
          setErrorMessage("This verification link is expired or invalid.");
        } else {
          setErrorMessage("We couldn't verify your account. Please try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResendMessage(null);

    const emailErr = validateEmail(resendEmail);
    setResendEmailError(emailErr);
    if (emailErr) {
      return;
    }

    setResending(true);
    try {
      await api.post("/api/auth/resend-verification", {
        email: resendEmail.trim(),
      });
      setResendMessage(
        "If an unverified account exists for that email, a new verification link is on its way.",
      );
    } catch (error) {
      if (isApiError(error) && error.status === 429) {
        setResendMessage("Too many requests. Please wait a moment and try again.");
      } else {
        setResendMessage("Couldn't resend right now. Please try again shortly.");
      }
    } finally {
      setResending(false);
    }
  }

  if (status === "verifying") {
    return (
      <AuthCard title="Verifying…" subtitle="Confirming your email address.">
        <p
          role="status"
          style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", margin: 0, color: "var(--color-text-muted)" }}
        >
          <Spinner color="var(--color-text-muted)" />
          Verifying…
        </p>
      </AuthCard>
    );
  }

  if (status === "success") {
    return (
      <AuthCard title="Email verified" subtitle="Your account is ready to use.">
        <p role="status" style={{ margin: 0, color: "var(--color-text)" }}>
          <span aria-hidden="true">✓ </span>
          Your email has been verified.
        </p>
        <Link href="/login" style={{ ...LINK_STYLE, marginTop: "var(--space-5)" }}>
          <Button type="button">Continue to login</Button>
        </Link>
      </AuthCard>
    );
  }

  // status === "error"
  return (
    <AuthCard title="Expired or invalid link" subtitle="We couldn't verify your account.">
      <p role="status" style={{ margin: "0 0 var(--space-4)", color: "var(--color-danger)" }}>
        {errorMessage}
      </p>

      <form
        onSubmit={onResend}
        noValidate
        aria-label="Resend verification"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={resendEmail}
          onChange={(e) => setResendEmail(e.target.value)}
          error={resendEmailError}
          disabled={resending}
        />
        <Button type="submit" disabled={resending}>
          {resending ? <Spinner /> : null}
          {resending ? "Sending…" : "Resend email"}
        </Button>
      </form>

      {resendMessage ? (
        <p
          role="status"
          style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}
        >
          {resendMessage}
        </p>
      ) : null}

      <Link href="/login" style={LINK_STYLE}>
        Back to log in →
      </Link>
    </AuthCard>
  );
}
