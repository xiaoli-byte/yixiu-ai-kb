/**
 * Cookie configuration shared by both systems' BFF-proxied Dashboards.
 *
 * Default `sameSite` is "lax" in BOTH dev and prod, because both apps deploy behind a
 * same-origin proxy (Next.js rewrites / route handler) rather than serving the API
 * cross-site. This deliberately fixes a real bug found in ai-call's current auth
 * controller (prod used `SameSite=None` with no CSRF token — see docs/authz-architecture.md
 * §0 and the ai-call architecture review); do not widen this back to "none" without also
 * adding CSRF protection.
 */
export interface AuthCookieConfig {
  isProd: boolean;
  /** overrides the `secure` flag; defaults to `isProd` */
  secureOverride?: boolean;
  sameSite?: "lax" | "strict" | "none";
  accessCookieName?: string;
  refreshCookieName?: string;
  /** path the refresh cookie is scoped to, e.g. "/api/auth/refresh" */
  refreshCookiePath?: string;
}

const DEFAULT_ACCESS_COOKIE_NAME = "access_token";
const DEFAULT_REFRESH_COOKIE_NAME = "refresh_token";
const DEFAULT_REFRESH_COOKIE_PATH = "/api/auth/refresh";

export function accessCookieName(config: AuthCookieConfig): string {
  return config.accessCookieName ?? DEFAULT_ACCESS_COOKIE_NAME;
}

export function refreshCookieName(config: AuthCookieConfig): string {
  return config.refreshCookieName ?? DEFAULT_REFRESH_COOKIE_NAME;
}

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  maxAge: number;
  path: string;
}

export function buildAccessCookieOptions(
  config: AuthCookieConfig,
  maxAgeMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secureOverride ?? config.isProd,
    sameSite: config.sameSite ?? "lax",
    maxAge: maxAgeMs,
    path: "/",
  };
}

export function buildRefreshCookieOptions(
  config: AuthCookieConfig,
  maxAgeMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secureOverride ?? config.isProd,
    sameSite: config.sameSite ?? "lax",
    maxAge: maxAgeMs,
    path: config.refreshCookiePath ?? DEFAULT_REFRESH_COOKIE_PATH,
  };
}
