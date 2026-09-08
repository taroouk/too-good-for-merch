import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, NO_STORE_HEADERS } from "src/lib/api/responses";
import { computePrice, customQuotePriceResult } from "src/pricing/engine";
import { isValidExchangeRate } from "src/pricing/currency";
import { computeOrderTotals } from "src/lib/orders/totals";
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
            customQuoteUsdCents: true,
            customQuoteNote: true,
            savedArtworkId: true,
            aiMockupId: true,
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

    // Bespoke/Custom builds never get a computePrice() result (see
    // src/pricing/engine.ts -- it always returns mode:"custom" for
    // product===CUSTOM by design). If an admin has since set a quote on
    // this build's draft, use that instead -- the one path a CUSTOM build
    // can reach a real, checkout-eligible price.
    const price =
      build.draft.product === "CUSTOM" && build.draft.customQuoteUsdCents != null
        ? customQuotePriceResult(build.draft.customQuoteUsdCents, build.draft.quantity, placements)
        : await computePrice({
            product: build.draft.product,
            fabric: build.draft.fabric,
            quantity: build.draft.quantity,
            placements,
          });

    // The checkout page previously displayed price.total on its own, which
    // is the pre-tax, pre-shipping SUBTOTAL in USD -- while Paymob charges
    // the tax/shipping-inclusive total in EGP, so the customer was shown
    // neither the right amount nor the right currency. Quote the full
    // breakdown from the same computeOrderTotals createCheckoutOrder uses
    // so the two cannot disagree. Null when the build isn't priceable
    // (bespoke/bulk) or the store's rate is unconfigured -- checkout fails
    // closed on the latter, and this must not invent a total meanwhile.
    const settings = await prisma.storeSetting.findUnique({ where: { id: "store" } }).catch(() => null);
    const totals =
      price.mode === "standard" && isValidExchangeRate(settings?.usdToEgpRate)
        ? computeOrderTotals({
            subtotalUsdCents: Math.round(price.total * 100),
            taxRateBps: settings?.taxRateBps,
            shippingCents: settings?.shippingCents,
            usdToEgpRate: settings.usdToEgpRate,
          })
        : null;

    return NextResponse.json(
      {
        totals,
        build: {
          id: build.id,
          name: build.name,
          draft: {
            product: build.draft.product,
            color: build.draft.color,
            fabric: build.draft.fabric,
            quantity: build.draft.quantity,
            customNotes: build.draft.customNotes,
            customQuoteNote: build.draft.customQuoteNote,
          },
        },
        price,
        placements,
        // Stable saved-artwork reference, if the customer has hit "Save
        // T-Shirt". Falls back to the live AI-mockup preview so the
        // checkout / bespoke-intake summary always shows *something* the
        // customer recognises.
        artworkUrl: build.draft.savedArtworkId
          ? `/api/artworks/${build.draft.savedArtworkId}/file`
          : build.draft.aiMockupId
            ? `/api/mockups/${build.draft.aiMockupId}/file`
            : null,
        walletEnabled: Boolean(process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim()),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("BUILD_QUOTE_ERROR", error);
    return apiError("Failed to fetch build.", 500, NO_STORE_HEADERS);
  }
}
