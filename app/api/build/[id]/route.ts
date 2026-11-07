import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, NO_STORE_HEADERS } from "src/lib/api/responses";
import { computePrice, customQuotePriceResult } from "src/pricing/engine";
import { isValidExchangeRate } from "src/pricing/currency";
import { computeOrderTotals } from "src/lib/orders/totals";
import { draftPricedPlacements } from "src/lib/orders/draft-placements";
import { productDisplayName } from "src/lib/orders/display";
import { designPreviewUrl } from "src/lib/mockup-preview";
import { getUserId } from "src/studio/authz";
import { canAccessBuild } from "src/studio/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
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
            printMockupId: true,
            primaryAssetId: true,
            artworkPlacement: true,
            artworkLayers: true,
            printMockupFingerprint: true,
            aiMockupFingerprint: true,
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

    // The quote shown on the checkout page uses exactly the placements an order would be priced on: the saved
    // design's. A `placements` query string is ignored, so what is displayed can never differ from what is charged.
    const placements = draftPricedPlacements(build.draft);

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

    // Order-summary thumbnail: the customer's own mockup when it is current
    // for what they are buying, otherwise the plain garment in the right cut
    // and colour -- never a stale picture of a different design.
    const draft = build.draft;
    const thumbnailUrl = designPreviewUrl(draft);

    return NextResponse.json(
      {
        totals,
        displayName: productDisplayName(draft),
        thumbnailUrl,
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
