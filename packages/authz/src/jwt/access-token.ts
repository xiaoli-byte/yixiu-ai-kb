import jwt, { type SignOptions } from "jsonwebtoken";
import type { AuthClaims } from "../core/claims.js";

export interface AccessTokenSignKeys {
  secret: string;
  /**
   * e.g. "15m", "7d". Typed as `string` (not jsonwebtoken's branded `ms.StringValue`)
   * because hosts read this from an env var at runtime, not a literal — validated by
   * `jwt.sign` itself at call time.
   */
  ttl: string;
}

export interface AccessTokenVerifyKeys {
  secret: string;
}

export function signAccessToken(claims: AuthClaims, keys: AccessTokenSignKeys): string {
  const { sub, tenantId, roles, email } = claims;
  return jwt.sign({ tenantId, roles, email }, keys.secret, {
    subject: sub,
    expiresIn: keys.ttl as SignOptions["expiresIn"],
  });
}

/** Throws (jsonwebtoken's TokenExpiredError/JsonWebTokenError) on invalid or expired tokens. */
export function verifyAccessToken(token: string, keys: AccessTokenVerifyKeys): AuthClaims {
  const payload = jwt.verify(token, keys.secret) as jwt.JwtPayload;
  if (!payload.sub || typeof payload.tenantId !== "string") {
    throw new Error("Invalid access token payload");
  }
  return {
    sub: payload.sub,
    tenantId: payload.tenantId,
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}

/** Decodes without verifying — only for reading claims from a token already trusted (e.g. after cookie round-trip). */
export function decodeAccessTokenUnsafe(token: string): Partial<AuthClaims> | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object") return null;
  const payload = decoded as jwt.JwtPayload;
  return {
    sub: payload.sub,
    tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined,
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
