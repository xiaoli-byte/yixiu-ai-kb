import { describe, expect, it } from "vitest";
import { generateRefreshToken, hashRefreshToken, verifyRefreshTokenHash } from "./refresh-token.js";

describe("refresh token hashing", () => {
  it("generates unique opaque tokens", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("verifies a token against its own hash", async () => {
    const token = generateRefreshToken();
    const storedHash = await hashRefreshToken(token);
    await expect(verifyRefreshTokenHash(token, storedHash)).resolves.toBe(true);
  });

  it("rejects a token that does not match the stored hash (simulating rotation)", async () => {
    const oldToken = generateRefreshToken();
    const newToken = generateRefreshToken();
    const storedHash = await hashRefreshToken(newToken);
    await expect(verifyRefreshTokenHash(oldToken, storedHash)).resolves.toBe(false);
  });
});
