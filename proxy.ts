import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  // The admin login page must be reachable without a session (it is the
  // place unauthenticated admins are sent to).
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();

  // getToken()'s own secure-cookie auto-detection is unreliable in the Edge
  // Middleware runtime -- confirmed in production: NextAuth sets
  // __Secure-next-auth.session-token (verified via /api/auth/session
  // returning a valid ADMIN session), but this call was still returning a
  // null token, because it was looking for the unprefixed
  // next-auth.session-token cookie that was never set. Deriving
  // secureCookie from the request's own protocol makes it agree with
  // NextAuth's actual cookie name instead of guessing.
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: request.nextUrl.protocol === "https:",
  });
  // Only "is there a valid session at all" is decided here. The JWT's role
  // claim is frozen at sign-in, so gating on it would make a freshly
  // promoted admin sign out and back in, while a demoted one still passed.
  // The authoritative role + blockedAt check happens against the database
  // in app/admin/(panel)/layout.tsx (requireAdmin), every admin server action, and
  // getAdminUser() in every /api/admin route -- a signed-in non-admin is
  // bounced there.
  if (!token) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

// /api/admin/:path* is included here too as a cheap early reject for
// unauthenticated requests, matching /admin/:path*'s treatment -- but this
// is defense in depth only. Every app/api/admin/** route handler still
// re-verifies role + blockedAt against the database itself via
// getAdminUser() (src/lib/admin/auth.ts), since this Edge check can only
// see the JWT's `role` claim, which goes stale the moment an admin is
// demoted or blocked mid-session.
export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
