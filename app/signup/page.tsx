"use client";

/**
 * Sign-up screen (plan §5.4, wireframe 2 — center card).
 *
 * Public route (outside the `(app)` guarded group): no session required. Fields
 * are email + password + confirm password. Client-side validation is UX-only
 * (§11.7) — the backend re-validates; on `400` we map returned field errors back
 * to inline messages. States implemented:
 *   - default form; submitting (button spinner + inputs disabled);
 *   - success ("check your email to verify", no auto-login) with a link to login;
 *   - error: 409 → generic "account may already exist"; 400 → inline field errors.
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { api, isApiError } from "@/lib/api-client";
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from "@/lib/auth-validation";
import { AuthCard, Button, PasswordField, Spinner, TextField } from "@/ui";

interface FieldErrors {
  email?: string | null;
  password?: string | null;
  confirmPassword?: string | null;
}

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

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  function runClientValidation(): FieldErrors {
    return {
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    };
  }

  function hasErrors(errs: FieldErrors): boolean {
    return Boolean(errs.email || errs.password || errs.confirmPassword);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const clientErrors = runClientValidation();
    if (hasErrors(clientErrors)) {
      setFieldErrors(clientErrors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      await api.post("/api/auth/signup", {
        email: email.trim(),
        password,
        confirmPassword,
      });
      setSucceeded(true);
    } catch (error) {
      if (isApiError(error)) {
        if (error.status === 409) {
          setFormError("An account with this email may already exist.");
        } else if (error.status === 400 && error.fields) {
          setFieldErrors({
            email: error.fields.email ?? null,
            password: error.fields.password ?? null,
            confirmPassword: error.fields.confirmPassword ?? null,
          });
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

  if (succeeded) {
    return (
      <AuthCard
        title="Check your email"
        subtitle="Email verification is required."
      >
        <p role="status" style={{ color: "var(--color-text)", margin: 0 }}>
          We&rsquo;ve sent a verification link to{" "}
          <strong>{email.trim()}</strong>. Click the link in that email to verify
          your account, then log in.
        </p>
        <Link href="/login" style={LINK_STYLE}>
          Continue to log in →
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create account" subtitle="Email verification is required.">
      <form onSubmit={onSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
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
          error={fieldErrors.email}
          disabled={submitting}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={submitting}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          disabled={submitting}
        />

        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Signing up…" : "Sign up"}
        </Button>
      </form>

      <Link href="/login" style={LINK_STYLE}>
        Already registered? Log in →
      </Link>
    </AuthCard>
  );
}
