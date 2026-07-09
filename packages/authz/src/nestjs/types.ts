import type { RolePermissionMap } from "../core/can.js";
import type { AuthCookieConfig } from "../jwt/cookies.js";

export interface AuthzOptions {
  /** secret used to verify the access token cookie */
  accessSecret: string;
  cookies?: Partial<AuthCookieConfig>;
  /**
   * role -> granted permission keys. Pass a function so hosts can hot-reload the map
   * from the database after RBAC is moved out of hardcoded constants (see KB-03) without
   * restarting the process.
   */
  rolePermissionMap: RolePermissionMap | (() => RolePermissionMap);
}
