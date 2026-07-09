import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "../core/permission.js";

export const PERMISSIONS_KEY = "authz:permissions";

/** Marks a route as requiring ALL of the given permission keys (see core/can.ts). */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
