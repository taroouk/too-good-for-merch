import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

function label(value: string | null): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function BespokeSubmittedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/bespoke/${id}/submitted`)}`);
  }

  const request = await prisma.bespokeRequest.findUnique({
    where: { id },
    select: {
      id: true,
      requestNumber: true,
      userId: true,
      status: true,
      product: true,
      color: true,
      fabric: true,
      quantity: true,
      placements: true,
      customerEmail: true,
      customerPhone: true,
      artworkId: true,
    },
  });

  if (!request) notFound();
  if (session.user.role !== Role.ADMIN && request.userId !== session.user.id) notFound();

  const placements = Array.isArray(request.placements)
    ? request.placements.filter((p): p is string => typeof p === "string")
    : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="w-full max-w-lg rounded-[32px] bg-white p-9 text-center shadow-[0_24px_90px_rgba(0,0,0,.1)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[.18em] text-black/40">Request received</p>
        <h1 className="mt-2 text-3xl font-semibold">We&apos;ll be in touch</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">
          Thanks — your bespoke request <strong>{request.requestNumber}</strong> has been received.
          Our team will review the design and contact you at{" "}
          <strong>{request.customerEmail}</strong> or <strong>{request.customerPhone}</strong> with a
          tailored quote. No payment is needed right now.
        </p>

        {request.artworkId ? (
          <div className="mx-auto mt-6 flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl bg-[#efece6]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/artworks/${request.artworkId}/file`}
              alt="Saved artwork"
              className="h-full w-full object-contain"
            />
          </div>
        ) : null}

        <dl className="mx-auto mt-6 max-w-xs space-y-1.5 text-left text-sm text-black/60">
          <Row k="Product" v={label(request.product)} />
          <Row k="Colour" v={label(request.color)} />
          <Row k="Fabric" v={label(request.fabric)} />
          <Row k="Quantity" v={String(request.quantity)} />
          <Row k="Placements" v={placements.length ? placements.map(label).join(", ") : "—"} />
        </dl>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link href="/bespoke" className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            View my requests
          </Link>
          <a href="/studio" className="rounded-xl border border-black px-5 py-3 text-sm font-semibold">
            Back to studio
          </a>
        </div>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-black/40">{k}</dt>
      <dd className="font-medium text-black">{v}</dd>
    </div>
  );
}
