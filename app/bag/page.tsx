import AccountNav from "src/components/site/AccountNav";
import { designTitle } from "src/lib/design-title";
import { getStoreDisplay } from "src/lib/store-display";
import { formatDisplayPrice } from "src/pricing/display";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { actionRemoveFromBagForm } from "src/actions/bag-actions";
import { quoteCart } from "src/lib/orders/cart-checkout";
import { CheckoutError } from "src/lib/orders/errors";
import { formatMinorPrice } from "src/pricing/display";
import BagSync from "./BagSync";
import { computePrice } from "src/pricing/engine";
import { draftPricedPlacements } from "src/lib/orders/draft-placements";
import { designPreviewUrl } from "src/lib/mockup-preview";
import ProductCard, { CARD_BUTTON_DISABLED, CARD_BUTTON_PRIMARY, CARD_BUTTON_SECONDARY, CARD_GRID_CLASS, PAGE_BUTTON_CLASS } from "src/components/site/ProductCard";

export const dynamic = "force-dynamic";

function label(value: string | null): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function BagPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/bag");
  const userId = session.user.id;

  const items = await prisma.bagItem.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      buildId: true,
      size: true,
      createdAt: true,
      updatedAt: true,
      build: {
        select: {
          name: true,
          draft: {
            select: {
              product: true,
              color: true,
              fabric: true,
              quantity: true,
              customNotes: true,
              primaryAssetId: true,
              artworkPlacement: true,
              artworkLayers: true,
              printMockupId: true,
              printMockupFingerprint: true,
              aiMockupId: true,
              aiMockupFingerprint: true,
            },
          },
        },
      },
    },
  });

  // Builds from the bag that were already paid for (after being added), so
  // the bag can say "Ordered" instead of inviting a second checkout.
  const paid = items.length
    ? await prisma.order.findMany({
        where: { userId, buildId: { in: items.map((item) => item.buildId) }, paymentStatus: "PAID" },
        select: { id: true, buildId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const display = await getStoreDisplay();
  const rows = await Promise.all(
    items.map(async (item) => {
      const draft = item.build.draft;
      let priceText = "—";
      let sellable = false;
      if (draft?.product && draft.fabric) {
        const price = await computePrice({
          product: draft.product,
          fabric: draft.fabric,
          quantity: draft.quantity,
          placements: draftPricedPlacements(draft),
        }).catch(() => null);
        if (price?.mode === "standard") {
          priceText = formatDisplayPrice(price.total, display);
          sellable = true;
        } else if (price) {
          priceText = price.message;
        }
      }
      const order = paid.find((candidate) => candidate.buildId === item.buildId && candidate.createdAt >= item.createdAt);
      // The design's own current mockup, or the plain garment of the right
      // cut and colour -- never a stale picture of another design.
      const image = draft ? designPreviewUrl(draft) : null;
      return { item, draft, priceText, sellable, image, orderId: order?.id ?? null };
    }),
  );

  // One checkout and one payment for the whole bag: the total comes from the same code the order is created with.
  let cartTotal: { text: string } | { problem: string } | null = null;
  if (rows.length) {
    try {
      const quote = await quoteCart(userId);
      cartTotal = { text: formatMinorPrice(quote.totals.totalPaymentCents, quote.totals.paymentCurrency) };
    } catch (error) {
      cartTotal = { problem: error instanceof CheckoutError ? error.message : "Checkout is unavailable right now. Please try again shortly." };
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <BagSync count={rows.length} />
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/40">Account</p>
            <h1 className="mt-2 text-4xl font-semibold">Your Bag</h1>
            {rows.length ? <p className="mt-2 text-sm text-black/50">{rows.length} item{rows.length === 1 ? "" : "s"} · One checkout for everything in your bag</p> : null}
          </div>
          <Link href="/studio" className={PAGE_BUTTON_CLASS}>
            Open Studio
          </Link>
        </div>

        <AccountNav />

        {rows.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-lg font-semibold">Your Bag is empty</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-black/50">
              Press “Add to Bag” on a design in the Studio and it will show up here, ready to check out.
            </p>
            <Link href="/studio" className={`${PAGE_BUTTON_CLASS} mt-6`}>
              Start your design
            </Link>
          </div>
        ) : (
          <div className={CARD_GRID_CLASS}>
            {rows.map(({ item, draft, priceText, sellable, image, orderId }) => (
              <ProductCard
                key={item.id}
                image={image}
                imageAlt="Design preview"
                title={designTitle({ name: item.build.name, product: draft?.product, color: draft?.color })}
                price={priceText}
                details={[
                  ["Product", label(draft?.product ?? null)],
                  ["Colour", label(draft?.color ?? null)],
                  ["Fabric", label(draft?.fabric ?? null)],
                  ["Size", item.size],
                  ["Qty", String(draft?.quantity ?? 1)],
                ]}
                actions={
                  <>
                    {orderId ? (
                      <Link href={`/orders/${orderId}`} className={CARD_BUTTON_PRIMARY}>
                        View order
                      </Link>
                    ) : !sellable ? (
                      <span className={CARD_BUTTON_DISABLED}>Unavailable</span>
                    ) : null}
                    <Link href={`/studio/projects/${item.buildId}/builder?edit=1&size=${encodeURIComponent(item.size)}`} className={CARD_BUTTON_SECONDARY}>
                      Edit
                    </Link>
                    <form action={actionRemoveFromBagForm}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <button type="submit" className={CARD_BUTTON_SECONDARY}>
                        Remove
                      </button>
                    </form>
                  </>
                }
              />
            ))}
          </div>
        )}

        {rows.length && cartTotal ? (
          <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm" aria-label="Bag total">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/40">Bag total</p>
              {"text" in cartTotal ? (
                <p className="mt-1 text-2xl font-semibold">{cartTotal.text}</p>
              ) : (
                <p className="mt-1 text-sm text-black/60">{cartTotal.problem}</p>
              )}
            </div>
            {"text" in cartTotal ? (
              <Link href="/checkout?cart=1" className={CARD_BUTTON_PRIMARY}>
                Checkout
              </Link>
            ) : (
              <span className={CARD_BUTTON_DISABLED}>Checkout</span>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
