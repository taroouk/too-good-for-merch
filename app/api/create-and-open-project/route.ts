import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "src/auth";
import { BuildStatus } from "@prisma/client";
import { apiError } from "src/lib/api/responses";
import { rateLimit, rateLimitHeaders } from "src/lib/rate-limit";
import { rememberGuestBuildId } from "src/studio/permissions";

export async function POST(req: Request) {
  try {
    const limit = rateLimit(req, "studio:create-project", 10, 60 * 60 * 1000);
    if (!limit.ok) {
      return apiError(
        "Too many projects created. Please try again later.",
        429,
        rateLimitHeaders(limit),
      );
    }

    const session = await auth();

    const build = await prisma.build.create({
      data: {
        userId: session?.user?.id ?? null,
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

    if (!session?.user?.id) {
      await rememberGuestBuildId(build.id);
    }

    return NextResponse.json({
      success: true,
      buildId: build.id,
    });
  } catch (error) {
    console.error("CREATE PROJECT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create project",
      },
      { status: 500 }
    );
  }
}
