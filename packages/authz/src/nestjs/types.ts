import type { RolePermissionMap } from "../core/can.js";
import type { AccessTokenVerifyKeys } from "../jwt/access-token.js";
import type { AuthCookieConfig } from "../jwt/cookies.js";

export interface AuthzOptions {
  /** secret used to verify the access token cookie */
  accessSecret: string;
  /**
   * Optional asymmetric-aware verification material. When omitted the legacy
   * `accessSecret` path is used, preserving existing HS256 installations.
   */
  accessTokenVerifyKeys?: AccessTokenVerifyKeys;
  cookies?: Partial<AuthCookieConfig>;
  /**
   * role -> granted permission keys. Pass a function so hosts can hot-reload the map
   * from the database after RBAC is moved out of hardcoded constants (see KB-03) without
   * restarting the process.
   */
  rolePermissionMap: RolePermissionMap | (() => RolePermissionMap);
}
