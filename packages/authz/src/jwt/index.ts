export {
  signAccessToken,
  verifyAccessToken,
  decodeAccessTokenUnsafe,
} from "./access-token.js";
export type { AccessTokenSignKeys, AccessTokenVerifyKeys } from "./access-token.js";

export {
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshTokenHash,
} from "./refresh-token.js";

export {
  accessCookieName,
  refreshCookieName,
  buildAccessCookieOptions,
  buildRefreshCookieOptions,
} from "./cookies.js";
export type { AuthCookieConfig, CookieOptions } from "./cookies.js";

export { parseDurationMs } from "./duration.js";
