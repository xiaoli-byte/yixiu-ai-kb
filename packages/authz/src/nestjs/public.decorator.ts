import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "authz:isPublic";

/** Marks a route as not requiring an access token. `JwtAuthGuard` still parses a token if present. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
