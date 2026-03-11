// file: middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function isCheckoutPath(pathname: string): boolean {
  return pathname === "/checkout" || pathname.includes("/checkout");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isCheckoutPath(pathname)) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set(
    "callbackUrl",
    req.nextUrl.pathname + req.nextUrl.search
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};