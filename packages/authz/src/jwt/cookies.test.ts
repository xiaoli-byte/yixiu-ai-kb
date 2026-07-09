import { describe, expect, it } from "vitest";
import { buildAccessCookieOptions, buildRefreshCookieOptions } from "./cookies.js";

describe("cookie options", () => {
  it("defaults to SameSite=Lax in both dev and prod (same-origin BFF proxy assumption)", () => {
    expect(buildAccessCookieOptions({ isProd: false }, 1000).sameSite).toBe("lax");
    expect(buildAccessCookieOptions({ isProd: true }, 1000).sameSite).toBe("lax");
  });

  it("ties `secure` to isProd by default", () => {
    expect(buildAccessCookieOptions({ isProd: false }, 1000).secure).toBe(false);
    expect(buildAccessCookieOptions({ isProd: true }, 1000).secure).toBe(true);
  });

  it("allows an explicit secureOverride", () => {
    expect(buildAccessCookieOptions({ isProd: false, secureOverride: true }, 1000).secure).toBe(true);
  });

  it("scopes the refresh cookie to the configured path", () => {
    const options = buildRefreshCookieOptions(
      { isProd: true, refreshCookiePath: "/api/auth/refresh" },
      1000,
    );
    expect(options.path).toBe("/api/auth/refresh");
  });
});
