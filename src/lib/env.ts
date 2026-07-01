/**
 * Typed environment loader.
 *
 * Parses and validates `process.env` with Zod and exposes a single typed `env`
 * object for the rest of the application. Validation runs once at module load so
 * the process fails fast with a clear message if a required variable is missing
 * or malformed.
 *
 * The pure {@link parseEnv} function is exported separately so it can be
 * unit-tested in isolation against an arbitrary record (no reliance on the real
 * `process.env`).
 */
import { z } from "zod";

/**
 * Schema describing every environment variable the application consumes.
 *
 * Keep this in sync with `.env.example` and `docs/06-devops/environment.md`.
 */
export const envSchema = z.object({
  /** Node runtime mode. Defaults to "development" for local `next dev`. */
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  /**
   * Full PostgreSQL connection string used by the app and the migrate step,
   * e.g. `postgres://user:pass@db:5432/ticketing`.
   */
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .url("DATABASE_URL must be a valid connection URL"),

  /**
   * Secret used to sign the session cookie (ADR-0002). Must be long enough to
   * be a meaningful signing key; never commit a real value.
   */
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),

  /**
   * Public base URL of the app, used to build links in verification emails,
   * e.g. `http://localhost:3000`.
   */
  APP_URL: z
    .string()
    .min(1, "APP_URL is required")
    .url("APP_URL must be a valid URL"),

  /** SMTP relay host. Defaults to the DataArt relay. */
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),

  /** SMTP relay port. Coerced from string; defaults to 587 (STARTTLS). */
  SMTP_PORT: z.coerce
    .number()
    .int("SMTP_PORT must be an integer")
    .min(1, "SMTP_PORT must be a positive port number")
    .max(65535, "SMTP_PORT must be a valid port number")
    .default(587),

  /** SMTP auth username. Optional — some relays accept unauthenticated mail. */
  SMTP_USER: z.string().optional(),

  /** SMTP auth password. Optional — only required when the relay needs auth. */
  SMTP_PASS: z.string().optional(),

  /**
   * "From" address used on outbound verification emails,
   * e.g. `Ticket Tracker <no-reply@dataart.com>`.
   */
  SMTP_FROM: z.string().min(1, "SMTP_FROM is required"),
});

/** Fully-typed, validated environment shape. */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an arbitrary environment-like record.
 *
 * Pure and side-effect free, so it is safe to call from unit tests. Throws an
 * {@link Error} with a readable, multi-line message listing every invalid or
 * missing variable when validation fails.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "(root)";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n` +
        "See .env.example for the full list of required variables.",
    );
  }

  return result.data;
}

let cachedEnv: Env | undefined;

/**
 * Validate and return the environment for the running process.
 *
 * Validation runs on first call and the result is cached, so the process still
 * fails fast at startup (call this from an entrypoint/bootstrap) while keeping
 * the module import itself side-effect free — importing {@link parseEnv} for a
 * unit test does not require a fully-populated `process.env`.
 */
export function getEnv(): Env {
  if (cachedEnv === undefined) {
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}

/**
 * The validated environment, resolved lazily on first property access.
 *
 * Accessing any property triggers (cached) validation of `process.env` and
 * fails fast with a clear error if configuration is missing/invalid. Reading a
 * property is all the application ever needs; importing the module is inert.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    return getEnv()[prop as keyof Env];
  },
  has(_target, prop) {
    return prop in getEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv() as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getEnv() as object, prop);
  },
}) satisfies Env;
