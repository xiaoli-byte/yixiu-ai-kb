import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";

const SALT_ROUNDS = 10;

/**
 * Refresh tokens are opaque random values, NOT JWTs — they carry no readable claims and
 * are only good for a hash lookup against server-side storage. This is the ai-call
 * pattern (bcrypt full-hash, revocable, rotated on use) adopted as the shared standard;
 * see docs/authz-architecture.md §0 (ai-knowledge previously stored only the last 32
 * characters unhashed, which this replaces).
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(rawToken: string): Promise<string> {
  return hash(rawToken, SALT_ROUNDS);
}

export function verifyRefreshTokenHash(rawToken: string, storedHash: string): Promise<boolean> {
  return compare(rawToken, storedHash);
}
