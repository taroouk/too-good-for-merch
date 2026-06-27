import { BuildStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { GUEST_BUILD_COOKIE } from "src/studio/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const build = await createStarterBuild(userId);
  const response = NextResponse.redirect(
    new URL(`/studio/projects/${build.id}/builder`, req.url),
  );

  if (!userId) {
    response.cookies.set(GUEST_BUILD_COOKIE, build.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
