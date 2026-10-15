import { getStoreDisplay } from "src/lib/store-display";
import { formatDisplayPrice } from "src/pricing/display";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { actionRemoveFromBagForm } from "src/actions/bag-actions";
import { checkoutHref } from "src/lib/bag";
import BagSync from "./BagSync";
import { computePrice } from "src/pricing/engine";
import { placementsFromCustomNotes, placementsOrDefault } from "src/pricing/placements";

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
              savedArtworkId: true,
              printMockupId: true,
              aiMockupId: true,
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
          placements: placementsOrDefault(placementsFromCustomNotes(draft.customNotes)),
        }).catch(() => null);
        if (price?.mode === "standard") {
          priceText = formatDisplayPrice(price.total, display);
          sellable = true;
        } else if (price) {
          priceText = price.message;
        }
      }
      const order = paid.find((candidate) => candidate.buildId === item.buildId && candidate.createdAt >= item.createdAt);
      const image = draft?.printMockupId
        ? `/api/mockups/${draft.printMockupId}/file`
        : draft?.aiMockupId
          ? `/api/mockups/${draft.aiMockupId}/file`
          : draft?.savedArtworkId
            ? `/api/artworks/${draft.savedArtworkId}/file`
            : null;
      return { item, draft, priceText, sellable, image, orderId: order?.id ?? null };
    }),
  );

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <BagSync count={rows.length} />
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">Account</p>
            <h1 className="mt-2 text-4xl font-semibold">Your bag</h1>
            {rows.length ? <p className="mt-2 text-sm text-black/50">{rows.length} item{rows.length === 1 ? "" : "s"} · each item is checked out separately</p> : null}
          </div>
          <Link href="/studio" className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            Open studio
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-lg font-semibold">Your bag is empty</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-black/50">
              Press “Add to Bag” on a design in the studio and it will show up here, ready to check out.
            </p>
            <Link href="/studio" className="mt-6 inline-flex rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
              Start a build
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {rows.map(({ item, draft, priceText, sellable, image, orderId }) => (
              <article key={item.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="flex h-56 items-center justify-center bg-[#efece6]">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="Design preview" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-sm text-black/40">No preview yet</span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold">{item.build.name ?? "Studio build"}</h2>
                    <strong className="shrink-0 text-lg">{priceText}</strong>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-black/60">
                    <div className="flex justify-between gap-2"><dt className="text-black/40">Product</dt><dd className="font-medium text-black">{label(draft?.product ?? null)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-black/40">Colour</dt><dd className="font-medium text-black">{label(draft?.color ?? null)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-black/40">Fabric</dt><dd className="font-medium text-black">{label(draft?.fabric ?? null)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-black/40">Size</dt><dd className="font-medium text-black">{item.size}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-black/40">Qty</dt><dd className="font-medium text-black">{draft?.quantity ?? 1}</dd></div>
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-3 pt-1">
                    {orderId ? (
                      <Link href={`/orders/${orderId}`} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
                        Ordered · view order
                      </Link>
                    ) : sellable ? (
                      <Link href={checkoutHref(item.buildId, item.size)} className="flex-1 rounded-xl bg-black px-4 py-2.5 text-center text-sm font-semibold text-white">
                        Checkout
                      </Link>
                    ) : (
                      <span className="flex-1 rounded-xl bg-black/10 px-4 py-2.5 text-center text-sm font-semibold text-black/45">Unavailable</span>
                    )}
                    <Link href={`/studio/projects/${item.buildId}/builder`} className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-black/70 transition hover:border-black hover:text-black">
                      Edit
                    </Link>
                    <form action={actionRemoveFromBagForm}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <button type="submit" className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-black/70 transition hover:border-black hover:text-black">
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
