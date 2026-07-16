import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 需要登录才能访问的路由
const protectedRoutes = ["/overview", "/documents", "/search", "/qa", "/graph", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const normalizedPath = pathname.replace(/^\/knowledge(?=\/|$)/, "") || "/";

  // 检查是否是受保护的路由
  const isProtectedRoute = protectedRoutes.some((route) =>
    normalizedPath.startsWith(route)
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // access token 只在 httpOnly cookie 中，middleware 可在服务端完成首层拦截。
  if (request.cookies.get("access_token")?.value) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
