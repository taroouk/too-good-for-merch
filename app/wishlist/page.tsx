import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { actionRemoveFromWishlistForm } from "src/actions/wishlist-actions";
import { designTitle } from "src/lib/design-title";
import AccountNav from "src/components/site/AccountNav";
import RemoveWishlistButton from "./RemoveWishlistButton";
import { getBespokeShirtImage } from "src/studio/render/bespoke-shirt-image";

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
      updatedAt: true,
      build: { select: { name: true } },
    },
  });

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">Account</p>
            <h1 className="mt-2 text-4xl font-semibold">Your Wishlist</h1>
            <p className="mt-2 text-sm text-black/50">{items.length ? `${items.length} saved design${items.length === 1 ? "" : "s"}` : "Designs you save appear here."}</p>
          </div>
          <Link href="/studio" className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
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
            <Link
              href="/studio"
              className="mt-6 inline-flex rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"
            >
              Start your design
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm"
              >
                <div className="flex aspect-[4/3] items-center justify-center bg-[#efece6]">
                  {/* The saved design if there is one, otherwise a plain shirt in the chosen colour. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.artworkId ? `/api/artworks/${item.artworkId}/file` : getBespokeShirtImage(item.product, item.color, "CENTER_FRONT")}
                    alt={item.artworkId ? "Your saved design" : `${label(item.color)} ${label(item.product)} T-shirt`}
                    className={`h-full w-full ${item.artworkId ? "object-contain" : "object-contain p-4"}`}
                  />
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-semibold">{designTitle({ name: item.build?.name, product: item.product, color: item.color })}</h2>
                  <dl className="mt-3 grid grid-cols-1 gap-y-1.5 text-sm text-black/60">
                    <div className="flex justify-between gap-2">
                      <dt className="text-black/40">Product</dt>
                      <dd className="font-medium text-black">{label(item.product)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-black/40">Colour</dt>
                      <dd className="font-medium text-black">{label(item.color)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-black/40">Fabric</dt>
                      <dd className="font-medium text-black">{label(item.fabric)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-black/40">Qty</dt>
                      <dd className="font-medium text-black">{item.quantity}</dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex flex-wrap items-center gap-3 pt-1">
                    <Link
                      href={`/studio/projects/${item.buildId}/builder`}
                      className="flex-1 rounded-xl bg-black px-4 py-2.5 text-center text-sm font-semibold text-white"
                    >
                      Open in Builder
                    </Link>
                    <RemoveWishlistButton action={actionRemoveFromWishlistForm} itemId={item.id} name={designTitle({ name: item.build?.name, product: item.product, color: item.color })} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
