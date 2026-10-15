import { prisma } from "src/lib/prisma";
import AdminToast from "src/components/admin/AdminToast";
import ExchangeRateForm from "src/components/admin/ExchangeRateForm";
import { updateDisplayCurrencyAction, updateStoreSettingsAction } from "src/actions/admin-system-actions";
import { DISPLAY_CURRENCIES, effectiveDisplay, formatDisplayPrice } from "src/pricing/display";
import { PRICING_CURRENCY } from "src/pricing/engine";
import { requireAdmin } from "src/lib/admin/auth";
import { getPaymobHealth } from "src/lib/admin/paymob-health";
import PageHeader from "src/components/admin/ui/PageHeader";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import { FieldLabel, Select } from "src/components/admin/ui/Input";
import { buttonClass } from "src/components/admin/ui/Button";

// Paymob's current merchant integration is EGP-only (see
// src/pricing/engine.ts / src/lib/orders/checkout.ts) -- this is a fixed
// fact about the account, not something an admin can change here. A future
// USD Paymob integration would need its own capability, not a value edited
// on this page.
const PAYMENT_CURRENCY = "EGP" as const;

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const [admin, settings] = await Promise.all([
    requireAdmin(),
    prisma.storeSetting.findUnique({ where: { id: "store" } }),
  ]);
  const paymobHealth = getPaymobHealth();
  const storeName = settings?.storeName ?? "Too Good For Merch";
  const currencyCode = settings?.currency ?? process.env.STORE_CURRENCY ?? "EGP";
  const taxRate = (settings?.taxRateBps ?? 0) / 100;
  const shipping = (settings?.shippingCents ?? 0) / 100;

  // "Last updated" for the rate specifically (not just the settings row in
  // general -- see the updatedAt caveat below): the most recent
  // STORE_SETTINGS_UPDATED audit entry whose recorded rate matches the
  // currently active one is the entry that set it. Bounded scan, no new
  // history table (see src/actions/admin-system-actions.ts).
  const recentSettingsAudits = settings?.usdToEgpRate != null
    ? await prisma.adminAuditLog.findMany({
        where: { action: "STORE_SETTINGS_UPDATED" },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { admin: { select: { email: true } } },
      })
    : [];
  const rateHistory = (
    await prisma.adminAuditLog.findMany({
      where: { action: "STORE_SETTINGS_UPDATED" },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { admin: { select: { email: true } } },
    })
  )
    .map((log) => {
      const m = log.metadata as { previousUsdToEgpRate?: number | null; usdToEgpRate?: number | null } | null;
      return { log, from: m?.previousUsdToEgpRate ?? null, to: m?.usdToEgpRate ?? null };
    })
    .filter((entry) => entry.from !== entry.to)
    .slice(0, 8);
  const selectedDisplay = DISPLAY_CURRENCIES.includes((settings?.displayCurrency ?? "USD") as (typeof DISPLAY_CURRENCIES)[number])
    ? (settings?.displayCurrency ?? "USD")
    : "USD";
  const activeDisplay = effectiveDisplay(settings?.displayCurrency, settings?.usdToEgpRate);
  const rateLastSetBy = recentSettingsAudits.find((log) => {
    const metadata = log.metadata as { usdToEgpRate?: number } | null;
    return metadata?.usdToEgpRate === settings?.usdToEgpRate;
  });

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="Configuration" title="Settings" subtitle="Store pricing preferences and server-only Paymob configuration health." />

        <Card className="mt-7" title="Store currency & payment" subtitle="Pricing and payment run in two different currencies on purpose — see below.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-admin-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-admin-faint">Pricing currency</p>
              <p className="mt-1 text-2xl font-semibold text-admin-ink">{PRICING_CURRENCY}</p>
              <p className="mt-1 text-xs leading-5 text-admin-faint">Every price in the catalog, Studio, and Admin Pricing is calculated in {PRICING_CURRENCY}. This is fixed.</p>
            </div>
            <div className="rounded-xl bg-admin-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-admin-faint">Payment currency</p>
              <p className="mt-1 text-2xl font-semibold text-admin-ink">{PAYMENT_CURRENCY}</p>
              <p className="mt-1 text-xs leading-5 text-admin-faint">Paymob is currently only provisioned for {PAYMENT_CURRENCY}, so every checkout converts to it below.</p>
            </div>
          </div>
          <div className="mt-5 border-t border-admin-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-faint">Today&apos;s active rate</p>
            {settings?.usdToEgpRate != null ? (
              <>
                <p className="mt-1 text-2xl font-semibold text-admin-ink">1 USD = {settings.usdToEgpRate} EGP</p>
                <p className="mt-1 text-xs text-admin-faint">
                  {rateLastSetBy
                    ? `Last updated ${formatDateTime(rateLastSetBy.createdAt)} by ${rateLastSetBy.admin?.email ?? "an admin"}`
                    : "Every new checkout converts using this rate."}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm font-semibold text-red-600">Not configured — checkout will fail until a rate is set below.</p>
            )}
            <ExchangeRateForm
              action={updateStoreSettingsAction}
              currentRate={settings?.usdToEgpRate ?? null}
              storeName={storeName}
              currency={currencyCode}
              taxRate={taxRate}
              shipping={shipping}
            />
          </div>
        </Card>

        <Card className="mt-6" title="Currency customers see" subtitle="What prices look like in the builder, bag and bespoke quotes. Orders are still recorded in USD and paid in EGP.">
          <form action={updateDisplayCurrencyAction} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <FieldLabel label="Display currency">
              <Select name="displayCurrency" defaultValue={selectedDisplay}>
                {DISPLAY_CURRENCIES.map((code) => (
                  <option key={code} value={code}>{code === "USD" ? "USD — US dollar" : "EGP — Egyptian pound"}</option>
                ))}
              </Select>
            </FieldLabel>
            <button className={buttonClass()}>Apply</button>
          </form>
          <div className="mt-4 rounded-xl bg-admin-canvas p-4 text-xs leading-5 text-admin-muted">
            <p>
              Right now customers see: <strong className="text-admin-ink">{activeDisplay.currency}</strong>
              {selectedDisplay === "EGP" && activeDisplay.currency === "USD" ? " (EGP is selected but no exchange rate is set, so USD is shown)" : ""}.
            </p>
            <p className="mt-1">Example — a {formatDisplayPrice(9.54, { currency: "USD", rate: 1 })} T-shirt appears as <strong className="text-admin-ink">{formatDisplayPrice(9.54, activeDisplay)}</strong>.</p>
            <p className="mt-1">EGP prices are USD price × the exchange rate above, so they match what Paymob charges.</p>
          </div>
        </Card>

        <Card className="mt-6" title="Exchange rate history" subtitle="Most recent changes. Existing orders always keep the rate they were placed with.">
          {rateHistory.length ? (
            <ul className="divide-y divide-admin-border text-sm">
              {rateHistory.map(({ log, from, to }) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="font-semibold text-admin-ink">{from != null ? `${from}` : "not set"} → {to != null ? `${to}` : "not set"} <span className="font-normal text-admin-faint">EGP per USD</span></span>
                  <span className="text-xs text-admin-faint">{formatDateTime(log.createdAt)} · {log.admin?.email ?? "an admin"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-admin-faint">No rate changes recorded yet.</p>
          )}
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Store settings" subtitle="Applied to new orders only.">
            <form action={updateStoreSettingsAction} className="space-y-4">
              <input type="hidden" name="usdToEgpRate" value={settings?.usdToEgpRate ?? ""} />
              <FieldLabel label="Store name">
                <input name="storeName" defaultValue={storeName} required className="h-11 w-full rounded-xl border border-admin-border-strong px-4 outline-none focus:border-admin-ink" />
              </FieldLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Payment currency code">
                  <input name="currency" defaultValue={currencyCode} minLength={3} maxLength={3} required className="h-11 w-full rounded-xl border border-admin-border-strong px-4 uppercase outline-none focus:border-admin-ink" />
                </FieldLabel>
                <FieldLabel label="Tax rate (%)">
                  <input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={taxRate} required className="h-11 w-full rounded-xl border border-admin-border-strong px-4 outline-none focus:border-admin-ink" />
                </FieldLabel>
              </div>
              <p className="-mt-2 text-[11px] leading-4 text-admin-faint">Internal reconciliation code for payment retries. Paymob currently charges in EGP only — keep this as EGP.</p>
              <FieldLabel label={`Flat shipping (${PRICING_CURRENCY})`}>
                <input name="shipping" type="number" min="0" step="0.01" defaultValue={shipping} required className="h-11 w-full rounded-xl border border-admin-border-strong px-4 outline-none focus:border-admin-ink" />
              </FieldLabel>
              <button className={buttonClass({ className: "w-full" })}>Save settings</button>
            </form>
          </Card>

          <Card title="Paymob configuration" subtitle="Secrets are read from server environment variables and are never displayed.">
            <div className="space-y-3">
              {paymobHealth.items.map((item) => (
                <div key={item.envVar} className="flex items-center justify-between gap-3 rounded-xl bg-admin-canvas p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-admin-ink">{item.label}</p>
                    <p className="mt-1 break-all font-mono text-[10px] text-admin-faint">{item.envVar}</p>
                  </div>
                  <div className="shrink-0">
                    <Badge tone={item.configured ? "success" : item.required ? "danger" : "neutral"}>
                      {item.configured ? "Configured" : item.required ? "Missing" : "Optional"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">
              Set the processed callback to <strong>/api/payments/paymob/webhook</strong> and the response callback to <strong>/api/payments/paymob/verify</strong> in Paymob.
            </div>
          </Card>
        </div>

        <Card className="mt-6" title="Admin" subtitle="Signed in as">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-admin-canvas p-4">
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-admin-ink">{admin.email}</p>
              <p className="mt-1 text-xs text-admin-faint">Admin accounts are managed via the <code className="font-mono">db:seed:admins</code> script, not from this page.</p>
            </div>
            <div className="shrink-0">
              <Badge tone="dark">Admin</Badge>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
