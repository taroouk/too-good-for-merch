import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  // مثال حماية /studio
  if (req.nextUrl.pathname.startsWith("/studio")) {
    if (!token) return NextResponse.redirect(new URL("/login", req.url));
    if ((token as any).role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/studio/:path*"] };