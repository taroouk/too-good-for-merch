import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, NO_STORE_HEADERS } from "src/lib/api/responses";
import { computePrice } from "src/pricing/engine";
import {
  normalizePlacements,
  placementsFromCustomNotes,
  placementsOrDefault,
} from "src/pricing/placements";
import { getUserId } from "src/studio/authz";
import { canAccessBuild } from "src/studio/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    const build = await prisma.build.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
        draft: {
          select: {
            product: true,
            color: true,
            fabric: true,
            quantity: true,
            customNotes: true,
          },
        },
      },
    });

    if (!build?.draft) {
      return apiError("Build not found.", 404, NO_STORE_HEADERS);
    }

    if (!(await canAccessBuild(userId, build))) {
      return apiError("Build not found.", 404, NO_STORE_HEADERS);
    }

    const queryPlacements = new URL(req.url).searchParams.get("placements");
    const requestedPlacements = normalizePlacements(queryPlacements);
    const draftPlacements = placementsFromCustomNotes(build.draft.customNotes);
    const placements = placementsOrDefault(
      requestedPlacements.length ? requestedPlacements : draftPlacements,
    );

    const price = await computePrice({
      product: build.draft.product,
      fabric: build.draft.fabric,
      quantity: build.draft.quantity,
      placements,
    });

    return NextResponse.json(
      {
        build: {
          id: build.id,
          name: build.name,
          draft: {
            product: build.draft.product,
            color: build.draft.color,
            fabric: build.draft.fabric,
            quantity: build.draft.quantity,
            customNotes: build.draft.customNotes,
          },
        },
        price,
        placements,
        walletEnabled: Boolean(process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim()),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("BUILD_QUOTE_ERROR", error);
    return apiError("Failed to fetch build.", 500, NO_STORE_HEADERS);
  }
}
