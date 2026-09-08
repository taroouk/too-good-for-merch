import { BuildStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { GUEST_BUILD_COOKIE } from "src/studio/permissions";
import { signGuestBuildToken } from "src/studio/guest-token";
import { rateLimit, rateLimitByKey } from "src/lib/rate-limit-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// P2-7: this is a plain GET that unconditionally writes a new Build (+
// BuildDraft) row on every hit, with no auth requirement. Kept as GET (not
// converted to POST) because it's wired up across the app as a plain
// navigation link/redirect target for "start a new project" -- changing it
// to POST would require a form submission or client-side fetch everywhere
// it's linked, a much larger change than this audit item calls for. GET
// requests to it are also exactly the kind of URL a crawler, link-prefetch,
// or automated scanner will hit with no user intent behind it, and each hit
// costs a real DB write with no natural ceiling. Rate limiting closes that
// gap without changing the route's method or the onboarding UX: a genuine
// user clicking "start a project" a handful of times a minute is nowhere
// near these limits, but a crawler/script hammering the URL is capped.
// DB-backed (not in-memory) because this is a real write with real cost and
// needs to be bounded across every serverless instance, not just one.
const STARTER_BUILD_LIMIT = 20;
const STARTER_BUILD_WINDOW_MS = 10 * 60 * 1000;

async function createStarterBuild(userId: string | null) {
  return prisma.build.create({
    data: {
      userId,
      name: "Untitled",
      status: BuildStatus.ACTIVE,
      draft: {
        create: {
          product: null,
          color: null,
          fabric: null,
          quantity: 1,
          customNotes: null,
          primaryAssetId: null,
        },
      },
    },
    select: { id: true },
  });
}

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const limit = userId
    ? await rateLimitByKey("studio:start:user", userId, STARTER_BUILD_LIMIT, STARTER_BUILD_WINDOW_MS)
    : await rateLimit(req, "studio:start:ip", STARTER_BUILD_LIMIT, STARTER_BUILD_WINDOW_MS);

  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many new projects started. Please try again shortly." },
      { status: 429 },
    );
  }

  const build = await createStarterBuild(userId);
  const response = NextResponse.redirect(
    new URL(`/studio/projects/${build.id}/builder`, req.url),
  );

  if (!userId) {
    response.cookies.set(GUEST_BUILD_COOKIE, signGuestBuildToken(build.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
