"use client";

/**
 * Login screen (plan §5.5, wireframe 2 — left card).
 *
 * Public route. Fields email + password. On `200` the HttpOnly session cookie is
 * set by the server and we redirect to `/board`. Errors:
 *   - 401 → generic "Incorrect email or password";
 *   - 403 `ACCOUNT_NOT_VERIFIED` → reveal a "Resend verification email" block
 *     that POSTs `/api/auth/resend-verification { email }` (generic success, and
 *     handles 429 rate limiting).
 * Client validation is required-fields only (UX); the backend is authoritative.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { api, isApiError } from "@/lib/api-client";
import { validateRequired } from "@/lib/auth-validation";
import { AuthCard, Button, PasswordField, Spinner, TextField } from "@/ui";

const LINK_STYLE = {
  display: "block",
  marginTop: "var(--space-5)",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
} as const;

const FORM_ERROR_STYLE = {
  color: "var(--color-danger)",
  fontSize: "var(--text-sm)",
  marginBottom: "var(--space-3)",
} as const;

const RESEND_BOX_STYLE = {
  marginTop: "var(--space-5)",
} as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forward already-authenticated visitors to the board instead of showing the
  // form. An anonymous `GET /api/auth/me` returns 401 without touching the DB.
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.get("/api/auth/me");
        if (!cancelled) {
          router.replace("/board");
          return;
        }
      } catch {
        // Anonymous (401) or unreachable — fall through to the login form.
      }
      if (!cancelled) {
        setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Revealed after a 403 ACCOUNT_NOT_VERIFIED.
  const [showResend, setShowResend] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const eErr = validateRequired(email, "Email is required");
    const pErr = validateRequired(password, "Password is required");
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/auth/login", { email: email.trim(), password });
      router.replace("/board");
    } catch (error) {
      if (isApiError(error)) {
        if (error.status === 403 && error.code === "ACCOUNT_NOT_VERIFIED") {
          setShowResend(true);
          setResendMessage(null);
          setFormError("Your account isn't verified yet.");
        } else if (error.status === 401) {
          setFormError("Incorrect email or password.");
        } else if (error.status === 400) {
          setFormError(error.message || "Please check your input.");
        } else {
          setFormError(error.message || "Something went wrong. Please try again.");
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setResending(true);
    setResendMessage(null);
    try {
      await api.post("/api/auth/resend-verification", { email: email.trim() });
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

  if (checkingSession) {
    return (
      <AuthCard title="Log in" subtitle="Use your verified account.">
        <div
          role="status"
          aria-label="Checking session"
          style={{ display: "flex", justifyContent: "center", padding: "var(--space-6)" }}
        >
          <Spinner />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Log in" subtitle="Use your verified account.">
      <form
        onSubmit={onSubmit}
        noValidate
        aria-label="Log in"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        {formError ? (
          <p role="alert" style={FORM_ERROR_STYLE}>
            {formError}
          </p>
        ) : null}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          disabled={submitting}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
          disabled={submitting}
        />

        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      {showResend ? (
        <div style={RESEND_BOX_STYLE} role="region" aria-label="Resend verification">
          <p
            style={{
              margin: "0 0 var(--space-3)",
              textAlign: "center",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            Account not verified?
          </p>
          <Button
            variant="secondary"
            onClick={onResend}
            disabled={resending}
            style={{ width: "100%" }}
          >
            {resending ? <Spinner /> : null}
            {resending ? "Sending…" : "Resend email"}
          </Button>
          {resendMessage ? (
            <p
              role="status"
              style={{
                marginTop: "var(--space-3)",
                textAlign: "center",
                fontSize: "var(--text-sm)",
                color: "var(--color-text-muted)",
              }}
            >
              {resendMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <Link href="/signup" style={LINK_STYLE}>
        Create an account →
      </Link>
    </AuthCard>
  );
}
