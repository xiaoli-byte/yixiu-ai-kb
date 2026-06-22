import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 需要登录才能访问的路由
const protectedRoutes = ["/documents", "/search", "/qa", "/graph", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 检查是否是受保护的路由
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // 客户端处理重定向（token 存在 localStorage 中，middleware 无法访问）
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
