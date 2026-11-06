import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { actionOpenWishlistItem, actionRemoveFromWishlistForm } from "src/actions/wishlist-actions";
import { designTitle } from "src/lib/design-title";
import AccountNav from "src/components/site/AccountNav";
import RemoveWishlistButton from "./RemoveWishlistButton";
import ProductCard, { CARD_BUTTON_PRIMARY, CARD_GRID_CLASS, PAGE_BUTTON_CLASS } from "src/components/site/ProductCard";
import { normalizeArtworkLayers } from "src/studio/artwork-layers";
import { designPreviewUrl } from "src/lib/mockup-preview";

export const dynamic = "force-dynamic";

function label(value: string | null): string {
  if (!value) return "—";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/wishlist");

  const items = await prisma.wishlistItem.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      buildId: true,
      artworkId: true,
      product: true,
      color: true,
      fabric: true,
      quantity: true,
      size: true,
      placements: true,
      design: true,
      updatedAt: true,
      build: { select: { name: true } },
    },
  });

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/40">Account</p>
            <h1 className="mt-2 text-4xl font-semibold">Your Wishlist</h1>
            <p className="mt-2 text-sm text-black/50">{items.length ? `${items.length} saved design${items.length === 1 ? "" : "s"}` : "Designs you save appear here."}</p>
          </div>
          <Link href="/studio" className={PAGE_BUTTON_CLASS}>
            Open Studio
          </Link>
        </div>

        <AccountNav />

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-lg font-semibold">Your Wishlist is empty</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-black/50">
              Designs you save in the Studio will appear here.
            </p>
            <Link href="/studio" className={`${PAGE_BUTTON_CLASS} mt-6`}>
              Start your design
            </Link>
          </div>
        ) : (
          <div className={CARD_GRID_CLASS}>
            {items.map((item) => {
              const design = item.design && typeof item.design === "object" ? (item.design as Record<string, unknown>) : null;
              const mockups = (design?.mockups && typeof design.mockups === "object" ? design.mockups : {}) as Record<string, string | null>;
              const title = designTitle({ name: item.build?.name, product: item.product, color: item.color });
              const image = designPreviewUrl(
                {
                  product: item.product,
                  color: item.color,
                  printMockupId: mockups.printMockupId,
                  printMockupFingerprint: mockups.printMockupFingerprint,
                  aiMockupId: mockups.aiMockupId,
                  aiMockupFingerprint: mockups.aiMockupFingerprint,
                },
                normalizeArtworkLayers(design?.layers),
              );
              return (
                <ProductCard
                  key={item.id}
                  image={image}
                  imageAlt={`${label(item.color)} ${label(item.product)} T-shirt`}
                  title={title}
                  details={[
                    ["Product", label(item.product)],
                    ["Colour", label(item.color)],
                    ["Fabric", label(item.fabric)],
                    ["Size", item.size ?? "—"],
                    ["Qty", String(item.quantity)],
                  ]}
                  actions={
                    <>
                      <form action={actionOpenWishlistItem} className="flex flex-1">
                        <input type="hidden" name="itemId" value={item.id} />
                        <button type="submit" className={CARD_BUTTON_PRIMARY}>
                          Open in Studio
                        </button>
                      </form>
                      <RemoveWishlistButton action={actionRemoveFromWishlistForm} itemId={item.id} name={title} />
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
