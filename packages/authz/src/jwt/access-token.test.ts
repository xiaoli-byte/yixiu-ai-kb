import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { decodeAccessTokenUnsafe, signAccessToken, verifyAccessToken } from "./access-token.js";
import type { AuthClaims } from "../core/claims.js";

const claims: AuthClaims = {
  sub: "user-1",
  tenantId: "tenant-1",
  roles: ["viewer"],
  email: "user@example.com",
};

describe("access token sign/verify round trip", () => {
  it("verifies a freshly signed token and returns the original claims", () => {
    const token = signAccessToken(claims, { secret: "test-secret", ttl: "15m" });
    const verified = verifyAccessToken(token, { secret: "test-secret" });
    expect(verified).toEqual(claims);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signAccessToken(claims, { secret: "secret-a", ttl: "15m" });
    expect(() => verifyAccessToken(token, { secret: "secret-b" })).toThrow();
  });

  it("signs with an RS256 private key and verifies with its public key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = signAccessToken(claims, {
      secret: "legacy-secret-not-used-by-rs256",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      algorithm: "RS256",
      keyId: "ai-call-v1",
      ttl: "15m",
    });

    expect(verifyAccessToken(token, {
      secret: "legacy-secret-not-used-by-rs256",
      publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
      algorithm: "RS256",
    })).toEqual(claims);
  });

  it("does not verify an RS256 token with a different public key", () => {
    const signer = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = signAccessToken(claims, {
      secret: "legacy-secret-not-used-by-rs256",
      privateKey: signer.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      algorithm: "RS256",
      ttl: "15m",
    });

    expect(() => verifyAccessToken(token, {
      secret: "legacy-secret-not-used-by-rs256",
      publicKey: other.publicKey.export({ type: "spki", format: "pem" }).toString(),
      algorithm: "RS256",
    })).toThrow();
  });

  it("rejects an expired token", () => {
    const token = signAccessToken(claims, { secret: "test-secret", ttl: "-1s" });
    expect(() => verifyAccessToken(token, { secret: "test-secret" })).toThrow();
  });

  it("decodeAccessTokenUnsafe reads claims without verifying the signature", () => {
    const token = signAccessToken(claims, { secret: "test-secret", ttl: "15m" });
    const decoded = decodeAccessTokenUnsafe(token);
    expect(decoded?.sub).toBe(claims.sub);
    expect(decoded?.tenantId).toBe(claims.tenantId);
    expect(decoded?.roles).toEqual(claims.roles);
  });
});
