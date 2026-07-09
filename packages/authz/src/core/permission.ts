/**
 * Permission code registry rules (docs/authz-architecture.md §4):
 * every permission key is "{system}:{module}:{action}" — one module registers its own
 * codes, no borrowing another module's code to gate access ("贴标签" is the anti-pattern
 * this fixes).
 *
 * `PERMISSION_ACTIONS` lists the common CRUD-ish actions for autocomplete/reference only
 * — it is NOT an exhaustive allowlist. Real modules mint their own verbs beyond CRUD (the
 * architecture doc's own example is `call:task:dispatch`; ai-call already has
 * `task:dispatch`), so `action` is typed and validated as a general identifier, not
 * restricted to this list.
 */
export const PERMISSION_ACTIONS = [
  "create",
  "read",
  "update",
  "delete",
  "manage",
] as const;

export type PermissionAction = string;

/**
 * Branded as a template literal for editor autocomplete/documentation value; at runtime
 * this is just a string, so `buildPermission` is the source of truth for well-formed keys
 * rather than the type system alone.
 */
export type PermissionKey = `${string}:${string}:${string}`;

const IDENTIFIER_RE = /^[a-z][a-z0-9_-]*$/i;

function assertValidSegment(label: string, value: string): void {
  if (!IDENTIFIER_RE.test(value)) {
    throw new Error(
      `buildPermission: invalid ${label} "${value}" — must match ${IDENTIFIER_RE}`,
    );
  }
}

export function buildPermission(
  system: string,
  module: string,
  action: PermissionAction,
): PermissionKey {
  assertValidSegment("system", system);
  assertValidSegment("module", module);
  assertValidSegment("action", action);
  return `${system}:${module}:${action}` as PermissionKey;
}

export interface ParsedPermission {
  system: string;
  module: string;
  action: PermissionAction;
}

export function parsePermission(key: string): ParsedPermission {
  const parts = key.split(":");
  if (parts.length !== 3) {
    throw new Error(`parsePermission: invalid permission key "${key}"`);
  }
  const [system, module, action] = parts as [string, string, string];
  assertValidSegment("system", system);
  assertValidSegment("module", module);
  assertValidSegment("action", action);
  return { system, module, action };
}
