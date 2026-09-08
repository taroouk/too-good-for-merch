import Link from "next/link";
import { redirect } from "next/navigation";
import { BespokeRequestStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { requireAdmin } from "src/lib/admin/auth";
import AdminToast from "src/components/admin/AdminToast";
import PageHeader from "src/components/admin/ui/PageHeader";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import EmptyState from "src/components/admin/ui/EmptyState";
import Pagination, { getPageCount, pageHref } from "src/components/admin/ui/Pagination";
import { BESPOKE_STATUS_LABELS, bespokeStatusTone } from "src/components/admin/ui/status";

// P2-11: this list was previously a single unpaginated findMany() over
// every bespoke request ever submitted -- unbounded, and only getting
// bigger. Open and closed requests are paginated independently (separate
// query params) rather than as one combined page, because they're
// rendered as two visually distinct sections and a single shared page
// would make the split between them jump around unpredictably as requests
// move between open/closed.
const PAGE_SIZE = 20;

const SELECT_FIELDS = {
  id: true,
  requestNumber: true,
  status: true,
  createdAt: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  product: true,
  color: true,
  fabric: true,
  quantity: true,
  size: true,
  placements: true,
  artworkId: true,
  quoteUsdCents: true,
} as const;

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function label(value: string | null): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const OPEN_STATUSES: BespokeRequestStatus[] = [
  BespokeRequestStatus.NEW,
  BespokeRequestStatus.CONTACTED,
  BespokeRequestStatus.QUOTED,
];

export default async function AdminBespokePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; openPage?: string; closedPage?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const openPage = Math.max(1, Number.parseInt(query.openPage ?? "1", 10) || 1);
  const closedPage = Math.max(1, Number.parseInt(query.closedPage ?? "1", 10) || 1);

  const [open, openCount, closed, closedCount] = await Promise.all([
    prisma.bespokeRequest.findMany({
      where: { status: { in: OPEN_STATUSES } },
      orderBy: [{ createdAt: "desc" }],
      skip: (openPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: SELECT_FIELDS,
    }),
    prisma.bespokeRequest.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.bespokeRequest.findMany({
      where: { status: { notIn: OPEN_STATUSES } },
      orderBy: [{ createdAt: "desc" }],
      skip: (closedPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: SELECT_FIELDS,
    }),
    prisma.bespokeRequest.count({ where: { status: { notIn: OPEN_STATUSES } } }),
  ]);

  const openPageCount = getPageCount(openCount, PAGE_SIZE);
  const closedPageCount = getPageCount(closedCount, PAGE_SIZE);
  if (openPage > openPageCount && openCount > 0) {
    redirect(pageHref("/admin/bespoke", { closedPage: String(closedPage) }, openPageCount, "openPage"));
  }
  if (closedPage > closedPageCount && closedCount > 0) {
    redirect(pageHref("/admin/bespoke", { openPage: String(openPage) }, closedPageCount, "closedPage"));
  }

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Operations"
          title="Bespoke Requests"
          subtitle="Customer-submitted custom garment requests. No payment is taken up front — review the design, contact the customer, and send a tailored quote."
        />

        <Card
          className="mt-7"
          title="Open"
          subtitle={`${openCount} request${openCount === 1 ? "" : "s"}`}
          padded={false}
        >
          <div className="space-y-4 p-5">
            {open.length ? (
              open.map((r) => <RequestRow key={r.id} r={r} />)
            ) : (
              <EmptyState
                title="No open requests"
                description="New bespoke requests from the studio will show up here."
              />
            )}
          </div>
          <Pagination
            page={openPage}
            pageSize={PAGE_SIZE}
            total={openCount}
            basePath="/admin/bespoke"
            params={{ closedPage: closedPage > 1 ? String(closedPage) : undefined }}
            pageParam="openPage"
          />
        </Card>

        {closedCount > 0 ? (
          <Card className="mt-6" title="Closed" subtitle={`${closedCount}`} padded={false}>
            <div className="space-y-4 p-5">
              {closed.map((r) => (
                <RequestRow key={r.id} r={r} />
              ))}
            </div>
            <Pagination
              page={closedPage}
              pageSize={PAGE_SIZE}
              total={closedCount}
              basePath="/admin/bespoke"
              params={{ openPage: openPage > 1 ? String(openPage) : undefined }}
              pageParam="closedPage"
            />
          </Card>
        ) : null}
      </div>
    </main>
  );
}

type Row = {
  id: string;
  requestNumber: string;
  status: BespokeRequestStatus;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  product: string | null;
  color: string | null;
  fabric: string | null;
  quantity: number;
  size: string | null;
  placements: unknown;
  artworkId: string | null;
  quoteUsdCents: number | null;
};

function RequestRow({ r }: { r: Row }) {
  const placements = Array.isArray(r.placements)
    ? r.placements.filter((p): p is string => typeof p === "string")
    : [];

  return (
    <Link
      href={`/admin/bespoke/${r.id}`}
      className="flex flex-col gap-5 rounded-2xl border border-admin-border p-5 transition hover:border-admin-ink sm:flex-row"
    >
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-admin-canvas text-xs text-admin-faint">
        {r.artworkId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/artworks/${r.artworkId}/file`}
            alt="Saved artwork"
            className="h-full w-full object-contain"
          />
        ) : (
          "No artwork"
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div>
            <p className="text-lg font-semibold text-admin-ink">{r.requestNumber}</p>
            <p className="mt-1 text-sm text-admin-muted">
              {r.customerName} · {r.customerEmail} · {r.customerPhone}
            </p>
            <p className="mt-1 text-xs text-admin-faint">
              {label(r.product)} · {label(r.color)} · {label(r.fabric)} · Qty {r.quantity}
              {r.size ? ` · ${r.size}` : ""} · {placements.map(label).join(", ") || "—"}
            </p>
            <p className="mt-1 text-xs text-admin-faint">Submitted {formatDateTime(r.createdAt)}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge tone={bespokeStatusTone(r.status)}>{BESPOKE_STATUS_LABELS[r.status]}</Badge>
            {r.quoteUsdCents != null ? (
              <span className="text-sm font-semibold text-admin-ink">
                {new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(
                  r.quoteUsdCents / 100,
                )}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
