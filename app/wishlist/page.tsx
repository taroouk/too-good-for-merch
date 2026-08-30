import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { actionRemoveFromWishlistForm } from "src/actions/wishlist-actions";

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
            <h1 className="mt-2 text-4xl font-semibold">Your wishlist</h1>
          </div>
          <Link href="/studio" className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            Open studio
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-lg font-semibold">Your wishlist is empty</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-black/50">
              Save a build from the studio and it will show up here, artwork and all.
            </p>
            <Link
              href="/studio"
              className="mt-6 inline-flex rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"
            >
              Start a build
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm"
              >
                <div className="flex h-52 items-center justify-center bg-[#efece6]">
                  {item.artworkId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/artworks/${item.artworkId}/file`}
                      alt="Saved artwork"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm text-black/40">No saved artwork</span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-semibold">{item.build?.name ?? "Studio build"}</h2>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-black/60">
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

                  <div className="mt-5 flex gap-3 pt-1">
                    <Link
                      href={`/studio/projects/${item.buildId}/builder`}
                      className="flex-1 rounded-xl bg-black px-4 py-2.5 text-center text-sm font-semibold text-white"
                    >
                      Open in Builder
                    </Link>
                    <form action={actionRemoveFromWishlistForm}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <button
                        type="submit"
                        className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-black/70 transition hover:border-black hover:text-black"
                      >
                        Remove
                      </button>
                    </form>
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
