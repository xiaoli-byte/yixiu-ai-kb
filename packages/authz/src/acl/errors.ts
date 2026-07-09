/**
 * Framework-agnostic on purpose — `acl/` has no dependency on NestJS. Hosts using the
 * `nestjs/` layer can catch this and rethrow as `ForbiddenException` if they want the
 * exact same HTTP semantics as a permissions-guard rejection.
 */
export class AccessDeniedError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "AccessDeniedError";
  }
}
