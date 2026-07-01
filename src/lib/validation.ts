/**
 * Zod validation helpers (plan §4 validation, server-first rule).
 *
 * Server-side validation is authoritative: every endpoint parses its input
 * through a Zod schema with {@link parseOrThrow}, which on failure throws a
 * `VALIDATION_ERROR` {@link AppError} whose `fields` map (`path -> message`)
 * feeds the error envelope and drives inline field errors on the client.
 *
 * A {@link trimmedString} helper centralises the "trim strings" rule (§4) so
 * `"  Payments  "` and `"Payments"` are treated identically before uniqueness /
 * non-empty checks run.
 */
import { z } from "zod";

import { AppError, type FieldErrors } from "@/server/http/errors";

/**
 * Convert a {@link z.ZodError} into a flat `path -> message` field map.
 *
 * Uses the first issue per path (endpoints surface one message per field). The
 * root path (`""`) is reported under the `_` key so form-level errors are still
 * addressable.
 */
export function zodErrorToFields(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    // Keep the first message seen for each field.
    if (!(key in fields)) {
      fields[key] = issue.message;
    }
  }
  return fields;
}

/**
 * Parse `input` with `schema`, returning the typed value on success or throwing
 * a `VALIDATION_ERROR` {@link AppError} (HTTP 400) carrying a per-field message
 * map on failure. Reusable across every route handler / service.
 */
export function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Validation failed", {
      fields: zodErrorToFields(result.error),
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * A trimmed, non-empty string schema (plan §4: trim strings; §3.1 non-empty
 * required text). Leading/trailing whitespace is stripped before length checks,
 * so a whitespace-only value fails as empty.
 *
 * @param message Message reported when the trimmed value is empty.
 */
export function trimmedString(message = "This field is required") {
  return z
    .string({ required_error: message, invalid_type_error: message })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message });
}

/**
 * An optional, nullable trimmed string that normalises empty/whitespace-only
 * input to `null` (used for fields like `epic.description`). A present,
 * non-empty value is trimmed and kept.
 */
export function optionalTrimmedString() {
  return z
    .string()
    .transform((value) => value.trim())
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}
