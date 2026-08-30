import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Received",
  CONTACTED: "In conversation",
  QUOTED: "Quote sent",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CLOSED: "Closed",
};

function money(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function BespokeListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/bespoke");

  const requests = await prisma.bespokeRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      requestNumber: true,
      status: true,
      createdAt: true,
      quoteUsdCents: true,
      quoteNote: true,
      artworkId: true,
      product: true,
    },
  });

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">Account</p>
            <h1 className="mt-2 text-4xl font-semibold">Bespoke requests</h1>
          </div>
          <Link href="/studio" className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            Open studio
          </Link>
        </div>

        <div className="mt-8 space-y-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm sm:flex-row sm:items-center"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#efece6]">
                {r.artworkId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/artworks/${r.artworkId}/file`} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-black/40">No art</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <strong>{r.requestNumber}</strong>
                <p className="mt-1 text-sm text-black/45">
                  {r.createdAt.toLocaleDateString("en-GB")}
                  {r.quoteUsdCents != null ? ` · Quote ${money(r.quoteUsdCents)}` : ""}
                </p>
                {r.quoteNote ? <p className="mt-1 text-sm text-black/55">{r.quoteNote}</p> : null}
              </div>
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold">
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
          ))}
          {!requests.length ? (
            <div className="rounded-2xl bg-white p-10 text-center text-black/50">
              No bespoke requests yet. Build a custom piece in the studio and submit it for a quote.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
