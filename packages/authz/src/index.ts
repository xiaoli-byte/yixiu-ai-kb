/**
 * Root barrel — re-exports every subpath. Prefer importing from the subpaths directly
 * (`@xiaoli-byte/authz/core`, `/jwt`, `/acl`, `/nestjs`, `/prisma`) so consumers that
 * don't use NestJS aren't forced to resolve `@nestjs/*` types just to import `can()`.
 */
export * from "./core/index.js";
export * from "./jwt/index.js";
export * from "./acl/index.js";
export * from "./nestjs/index.js";
export * from "./prisma/index.js";
