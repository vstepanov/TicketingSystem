/**
 * Client-side auth form validation (plan §5.4-5.6, §11.7).
 *
 * These helpers exist for UX only — they give instant inline feedback so the user
 * does not round-trip to the server for obvious mistakes. The backend re-validates
 * everything and remains the authoritative source of truth; the messages here
 * mirror the plan's copy ("Enter a valid email", etc.).
 */

/** Minimum password length (plan glossary / §4.2). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Pragmatic email shape check. Not RFC-complete on purpose — the server owns the
 * real rule; this only catches typos client-side.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  if (value.trim().length === 0) {
    return "Enter a valid email";
  }
  if (!EMAIL_RE.test(value.trim())) {
    return "Enter a valid email";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export function validateConfirmPassword(
  password: string,
  confirmPassword: string,
): string | null {
  if (confirmPassword !== password) {
    return "Passwords do not match";
  }
  return null;
}

/** Required-field check used by the login form (server owns full validation). */
export function validateRequired(value: string, message: string): string | null {
  return value.trim().length === 0 ? message : null;
}
