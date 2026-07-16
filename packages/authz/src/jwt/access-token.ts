import jwt, { type SignOptions, type VerifyOptions } from "jsonwebtoken";
import type { AuthClaims } from "../core/claims.js";

/**
 * `HS256` keeps existing development installs working. Production federation should
 * use `RS256`: ai-call holds the private key while ai-knowledge only receives its
 * public key and therefore cannot mint ai-call sessions.
 */
export type AccessTokenAlgorithm = "HS256" | "RS256";

export interface AccessTokenSignKeys {
  /** Legacy HS256 secret. Retained so existing callers remain source-compatible. */
  secret: string;
  /**
   * e.g. "15m", "7d". Typed as `string` (not jsonwebtoken's branded `ms.StringValue`)
   * because hosts read this from an env var at runtime, not a literal — validated by
   * `jwt.sign` itself at call time.
   */
  ttl: string;
  algorithm?: AccessTokenAlgorithm;
  /** Required when algorithm is RS256. PEM-encoded RSA private key. */
  privateKey?: string;
  /** Optional JWT `kid`, used for observable key rotation. */
  keyId?: string;
}

export interface AccessTokenVerifyKeys {
  /** Legacy HS256 secret. Retained so existing callers remain source-compatible. */
  secret: string;
  algorithm?: AccessTokenAlgorithm;
  /** Required when algorithm is RS256. PEM-encoded RSA public key. */
  publicKey?: string;
}

export function signAccessToken(claims: AuthClaims, keys: AccessTokenSignKeys): string {
  const { sub, tenantId, roles, email } = claims;
  const algorithm = keys.algorithm ?? "HS256";
  const signingKey = resolveSigningKey(keys, algorithm);
  const options: SignOptions = {
    subject: sub,
    expiresIn: keys.ttl as SignOptions["expiresIn"],
    algorithm,
  };
  if (keys.keyId) options.keyid = keys.keyId;
  return jwt.sign({ tenantId, roles, email }, signingKey, options);
}

/** Throws (jsonwebtoken's TokenExpiredError/JsonWebTokenError) on invalid or expired tokens. */
export function verifyAccessToken(token: string, keys: AccessTokenVerifyKeys): AuthClaims {
  const algorithm = keys.algorithm ?? "HS256";
  const verificationKey = resolveVerificationKey(keys, algorithm);
  const payload = jwt.verify(token, verificationKey, {
    algorithms: [algorithm],
  } satisfies VerifyOptions) as jwt.JwtPayload;
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

function resolveSigningKey(keys: AccessTokenSignKeys, algorithm: AccessTokenAlgorithm): string {
  if (algorithm === "RS256") {
    if (!keys.privateKey) throw new Error("RS256 access token signing requires privateKey");
    return keys.privateKey;
  }
  return keys.secret;
}

function resolveVerificationKey(
  keys: AccessTokenVerifyKeys,
  algorithm: AccessTokenAlgorithm,
): string {
  if (algorithm === "RS256") {
    if (!keys.publicKey) throw new Error("RS256 access token verification requires publicKey");
    return keys.publicKey;
  }
  return keys.secret;
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

/** Reads only the untrusted JOSE header so callers can select a verification key by `kid`. */
export function decodeAccessTokenHeaderUnsafe(
  token: string,
): { algorithm?: string; keyId?: string } | null {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded !== "object") return null;
  return {
    algorithm: typeof decoded.header.alg === "string" ? decoded.header.alg : undefined,
    keyId: typeof decoded.header.kid === "string" ? decoded.header.kid : undefined,
  };
}
