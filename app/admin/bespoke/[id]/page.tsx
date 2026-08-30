import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "src/lib/prisma";
import { requireAdmin } from "src/lib/admin/auth";
import {
  addBespokeRequestNoteAction,
  setBespokeRequestQuoteAction,
  updateBespokeRequestStatusAction,
} from "src/actions/admin-bespoke-actions";
import AdminToast from "src/components/admin/AdminToast";
import Breadcrumbs from "src/components/admin/ui/Breadcrumbs";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import EmptyState from "src/components/admin/ui/EmptyState";
import Input, { Label } from "src/components/admin/ui/Input";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { buttonClass } from "src/components/admin/ui/Button";
import {
  BESPOKE_STATUS_FLOW,
  BESPOKE_STATUS_LABELS,
  bespokeStatusTone,
} from "src/components/admin/ui/status";

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

function money(cents: number): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function AdminBespokeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;

  const request = await prisma.bespokeRequest.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, phone: true } },
      artwork: { select: { id: true, sha256: true, mimeType: true, model: true, createdAt: true } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { email: true } } },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { admin: { select: { email: true } } },
      },
    },
  });

  if (!request) notFound();

  const placements = Array.isArray(request.placements)
    ? request.placements.filter((p): p is string => typeof p === "string")
    : [];
  const nextStatuses = BESPOKE_STATUS_FLOW[request.status];
  const artworkUrl = request.artworkId ? `/api/artworks/${request.artworkId}/file` : null;

  return (
    <main className="px-4 py-10">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <Breadcrumbs
          items={[{ label: "Bespoke Requests", href: "/admin/bespoke" }, { label: request.requestNumber }]}
        />

        <Card className="mb-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-admin-faint">Submitted {formatDateTime(request.createdAt)}</p>
              <h1 className="mt-1 text-3xl font-semibold text-admin-ink">{request.requestNumber}</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-admin-muted">
                No payment was taken. Review the design, contact the customer, and record a tailored
                quote — saving a quote also unlocks the pay-later checkout on the customer&apos;s build.
              </p>
            </div>
            <Badge tone={bespokeStatusTone(request.status)}>
              {BESPOKE_STATUS_LABELS[request.status]}
            </Badge>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <section className="space-y-6">
            <Card title="Design snapshot" subtitle="Captured at submission — never changes.">
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="flex h-44 w-44 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-admin-canvas text-xs text-admin-faint">
                  {artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artworkUrl} alt="Saved artwork" className="h-full w-full object-contain" />
                  ) : (
                    "No artwork"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="grid gap-4 text-sm sm:grid-cols-2">
                    <Field k="Product" v={label(request.product)} />
                    <Field k="Colour" v={label(request.color)} />
                    <Field k="Fabric" v={label(request.fabric)} />
                    <Field k="Quantity" v={String(request.quantity)} />
                    <Field k="Size" v={request.size ?? "—"} />
                    <Field k="Placements" v={placements.map(label).join(", ") || "—"} />
                  </div>
                  {request.customNotes ? (
                    <div className="mt-4 rounded-xl bg-admin-canvas p-4 text-sm text-admin-muted">
                      {request.customNotes}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card title="Persistent artwork reference" subtitle="Exactly what the customer saved — no image was regenerated.">
              {request.artwork ? (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <Field k="Artwork ID" v={request.artwork.id} mono />
                  <Field k="SHA-256" v={request.artwork.sha256} mono />
                  <Field k="MIME type" v={request.artwork.mimeType} />
                  <Field k="Model" v={request.artwork.model ?? "—"} />
                  <div className="sm:col-span-2">
                    <a
                      href={artworkUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass({ variant: "outline", size: "sm" })}
                    >
                      Open artwork file
                    </a>
                  </div>
                </div>
              ) : (
                <EmptyState title="No artwork was saved with this request" />
              )}
              <div className="mt-4 rounded-xl bg-admin-canvas p-4 text-xs text-admin-faint">
                <p className="font-semibold text-admin-muted">Placement / transform</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(request.transform ?? null, null, 2)}
                </pre>
              </div>
            </Card>

            <Card title="Notifications" subtitle="Fired once, after the request was created.">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <Field
                  k="Customer email"
                  v={request.emailNotifiedAt ? formatDateTime(request.emailNotifiedAt) : "Not sent"}
                />
                <Field
                  k="Team WhatsApp"
                  v={
                    request.whatsappNotifiedAt
                      ? formatDateTime(request.whatsappNotifiedAt)
                      : "Not sent"
                  }
                />
                <Field k="Errors" v={request.notifyError ?? "None"} />
              </div>
            </Card>

            <Card title="Timeline" subtitle="Manual admin actions on this request.">
              <div className="space-y-3">
                {request.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col justify-between gap-2 rounded-xl border border-admin-border p-4 text-sm sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-semibold text-admin-ink">{log.action.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-xs text-admin-faint">
                        {log.previousValue && log.newValue
                          ? `${log.previousValue} → ${log.newValue}`
                          : "Recorded admin action"}
                      </p>
                    </div>
                    <p className="text-xs text-admin-faint">
                      {log.admin?.email ?? "Admin"} · {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                ))}
                {!request.auditLogs.length ? <EmptyState title="No changes recorded yet" /> : null}
              </div>
            </Card>

            <Card title="Internal notes" subtitle="Visible to admins only.">
              <form action={addBespokeRequestNoteAction} className="space-y-4">
                <input type="hidden" name="id" value={request.id} />
                <textarea
                  name="body"
                  required
                  placeholder="Add an internal note..."
                  className="min-h-24 w-full rounded-2xl border border-admin-border-strong bg-white p-4 text-sm outline-none focus:border-admin-ink"
                />
                <button type="submit" className={buttonClass()}>
                  Add note
                </button>
              </form>
              <div className="mt-6 space-y-3">
                {request.notes.map((note) => (
                  <div key={note.id} className="rounded-xl border border-admin-border p-4">
                    <p className="text-sm leading-6 text-admin-muted">{note.body}</p>
                    <p className="mt-3 text-xs text-admin-faint">
                      {note.author?.email ?? "Admin"} · {formatDateTime(note.createdAt)}
                    </p>
                  </div>
                ))}
                {!request.notes.length ? <EmptyState title="No internal notes yet" /> : null}
              </div>

              {request.buildId ? (
                <Link
                  href={`/studio/projects/${request.buildId}/builder`}
                  className={buttonClass({ variant: "outline", className: "mt-6 w-full" })}
                >
                  Open related build
                </Link>
              ) : null}
            </Card>
          </section>

          <aside className="space-y-6">
            <Card title="Customer">
              <div className="space-y-4 text-sm">
                <Field k="Name" v={request.customerName} />
                <Field k="Email" v={request.customerEmail || request.user?.email || "—"} />
                <Field k="Phone" v={request.customerPhone || request.user?.phone || "—"} />
              </div>
            </Card>

            <Card title="Tailored quote">
              {request.quoteUsdCents != null ? (
                <div className="mb-4 rounded-xl bg-admin-canvas p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-admin-faint">Current quote</span>
                    <span className="text-lg font-semibold text-admin-ink">
                      {money(request.quoteUsdCents)}
                    </span>
                  </div>
                  {request.quoteNote ? (
                    <p className="mt-2 text-admin-muted">{request.quoteNote}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-admin-faint">
                    {request.quotedByEmail ?? "Admin"} ·{" "}
                    {request.quotedAt ? formatDateTime(request.quotedAt) : ""}
                  </p>
                </div>
              ) : null}

              <form action={setBespokeRequestQuoteAction} className="space-y-3">
                <input type="hidden" name="id" value={request.id} />
                <Label>
                  <span className="text-xs font-medium text-admin-muted">Quote total (USD)</span>
                  <Input
                    type="number"
                    name="amountUsd"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue={
                      request.quoteUsdCents != null
                        ? (request.quoteUsdCents / 100).toFixed(2)
                        : undefined
                    }
                    placeholder="150.00"
                    className="mt-1 h-10 w-full"
                  />
                </Label>
                <Label>
                  <span className="text-xs font-medium text-admin-muted">Note to customer (optional)</span>
                  <Input
                    type="text"
                    name="note"
                    defaultValue={request.quoteNote ?? ""}
                    placeholder="e.g. Includes embroidery on both sleeves"
                    className="mt-1 h-10 w-full"
                  />
                </Label>
                <button type="submit" className={buttonClass({ className: "w-full" })}>
                  {request.quoteUsdCents != null ? "Update quote" : "Save quote"}
                </button>
              </form>
            </Card>

            <Card title="Status" subtitle="Move the request through the workflow.">
              {nextStatuses.length ? (
                <div className="space-y-3">
                  {nextStatuses.map((next) => (
                    <form key={next} action={updateBespokeRequestStatusAction}>
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="status" value={next} />
                      {next === "DECLINED" ? (
                        <ConfirmSubmitButton
                          variant="outline"
                          className="w-full"
                          confirmMessage={`Decline ${request.requestNumber}?`}
                        >
                          Move to {BESPOKE_STATUS_LABELS[next]}
                        </ConfirmSubmitButton>
                      ) : (
                        <button
                          type="submit"
                          className={buttonClass({ variant: "outline", className: "w-full" })}
                        >
                          Move to {BESPOKE_STATUS_LABELS[next]}
                        </button>
                      )}
                    </form>
                  ))}
                </div>
              ) : (
                <EmptyState title="No further status changes available" />
              )}
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-admin-faint">{k}</p>
      <p className={`mt-1 font-semibold text-admin-ink ${mono ? "break-all font-mono text-xs" : ""}`}>
        {v}
      </p>
    </div>
  );
}
