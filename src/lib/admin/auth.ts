import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { isAdminAccessAllowed } from "src/lib/admin/access";

// The JWT's `role` claim is only as fresh as the session token, so a user
// demoted from ADMIN or blocked after login would otherwise keep working
// admin access until their session expires/re-authenticates. Edge
// middleware (proxy.ts) still does the cheap JWT-only check to keep
// /admin/:path* (and /api/admin/:path*) off-limits to obviously
// unauthenticated traffic (Prisma can't run on the Edge runtime), but
// every actual admin server boundary -- every page under app/admin/**
// (via app/admin/layout.tsx), every admin-*-actions.ts server action, and
// every app/api/admin/** route handler -- re-verifies role + blockedAt
// against the database, the source of truth, before granting access via
// getAdminUser below. This runs once per admin page load / admin action /
// admin API call, not on every customer request, so it adds no DB load to
// the ordinary storefront path.
//
// getAdminUser() is the shared, non-redirecting primitive: it returns the
// admin's session shape on success or null on any denial, so both page/
// action callers (which redirect on null) and API route handlers (which
// return a 403 JSON response on null) go through the exact same DB-backed
// decision -- isAdminAccessAllowed, already exhaustively regression-tested
// at src/lib/admin/__tests__/access.test.ts -- instead of each reimplementing
// (and potentially under-implementing) their own check.
export async function getAdminUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true, blockedAt: true },
  });

  if (!user || !isAdminAccessAllowed(user)) return null;

  return { ...session.user, id: user.id, email: user.email, role: user.role };
}

export async function requireAdmin() {
  const admin = await getAdminUser();
  if (!admin) redirect("/login?callbackUrl=/admin");
  return admin;
}
