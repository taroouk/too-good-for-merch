// file: middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Public rules:
 * - /studio is PUBLIC
 * Protected rules:
 * - any route that includes "checkout" requires auth
 */
function isCheckoutPath(pathname: string): boolean {
  // Covers: /checkout, /studio/checkout, /studio/projects/123/checkout, etc.
  return pathname === "/checkout" || pathname.includes("/checkout");
}

function isPublicPath(pathname: string): boolean {
  // Keep studio public (and also login/register/api auth endpoints)
  if (pathname === "/") return true;
  if (pathname.startsWith("/studio")) return true; // ✅ studio is public
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/register")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (isPublicPath(pathname) && !isCheckoutPath(pathname)) {
    return NextResponse.next();
  }

  // Only protect checkout routes
  if (!isCheckoutPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /**
     * Run middleware on all pages except Next internals/static.
     * We'll decide inside whether to protect.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};