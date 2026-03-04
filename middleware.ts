import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (!pathname.startsWith("/studio")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", `${pathname}${search || ""}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/studio/:path*"],
};