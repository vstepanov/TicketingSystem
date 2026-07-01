/**
 * Password hashing (plan §11, glossary: Argon2id, never stored in plain text).
 *
 * Thin wrapper over `@node-rs/argon2` pinning the algorithm to Argon2id so the
 * choice lives in one place. The encoded output string embeds the algorithm,
 * parameters, and salt, so {@link verifyPassword} needs only the stored hash and
 * the candidate password.
 */
import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id algorithm selector. `@node-rs/argon2` exposes `Algorithm` as an
 * ambient `const enum`, which cannot be referenced at runtime under
 * `isolatedModules`; its Argon2id member is the value `2`. We declare the literal
 * once here so the intent stays explicit.
 */
const ARGON2ID = 2 as const;

/**
 * Argon2id parameters. These are OWASP-recommended defaults for Argon2id
 * (19 MiB memory, 2 passes, 1 lane). Encoded into the hash, so changing them
 * later does not break verification of existing hashes.
 */
const HASH_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash a plaintext password with Argon2id, returning the encoded hash string to
 * store in `users.password_hash`. The password length rule (≥ 8) is enforced by
 * the validation layer, not here.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS);
}

/**
 * Verify a candidate password against a stored Argon2id hash. Returns `false`
 * for a mismatch and, defensively, for a malformed/unparseable stored hash
 * (never throws on bad input) so callers can treat it as a plain boolean.
 */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
