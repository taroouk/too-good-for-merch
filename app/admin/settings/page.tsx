import { prisma } from "src/lib/prisma";
import AdminToast from "src/components/admin/AdminToast";
import ExchangeRateForm from "src/components/admin/ExchangeRateForm";
import { updateStoreSettingsAction } from "src/actions/admin-system-actions";
import { PRICING_CURRENCY } from "src/pricing/engine";

function configured(name: string) { return Boolean(process.env[name]?.trim()); }

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
  const settings = await prisma.storeSetting.findUnique({ where: { id: "store" } });
  const credentials = [
    ["API key", "PAYMOB_API_KEY"], ["Card integration", "PAYMOB_INTEGRATION_ID"], ["Card iframe", "PAYMOB_IFRAME_ID"], ["HMAC secret", "PAYMOB_HMAC_SECRET"], ["Wallet integration", "PAYMOB_WALLET_INTEGRATION_ID"],
  ];
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
  const rateLastSetBy = recentSettingsAudits.find((log) => {
    const metadata = log.metadata as { usdToEgpRate?: number } | null;
    return metadata?.usdToEgpRate === settings?.usdToEgpRate;
  });
  return <main className="p-4 sm:p-7 xl:p-9"><AdminToast message={query.notice}/><div className="mx-auto max-w-5xl"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Configuration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-2 text-sm text-black/45">Store pricing preferences and server-only Paymob configuration health.</p></div>

<section className="mt-7 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
  <h2 className="text-lg font-semibold">Store currency &amp; payment</h2>
  <p className="mt-1 text-xs text-black/40">Pricing and payment run in two different currencies on purpose — see below.</p>
  <div className="mt-5 grid gap-4 sm:grid-cols-2">
    <div className="rounded-xl bg-[#f8f8f8] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Pricing currency</p>
      <p className="mt-1 text-2xl font-semibold">{PRICING_CURRENCY}</p>
      <p className="mt-1 text-xs leading-5 text-black/45">Every price in the catalog, Studio, and Admin Pricing is calculated in {PRICING_CURRENCY}. This is fixed.</p>
    </div>
    <div className="rounded-xl bg-[#f8f8f8] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Payment currency</p>
      <p className="mt-1 text-2xl font-semibold">{PAYMENT_CURRENCY}</p>
      <p className="mt-1 text-xs leading-5 text-black/45">Paymob is currently only provisioned for {PAYMENT_CURRENCY}, so every checkout converts to it below.</p>
    </div>
  </div>
  <div className="mt-5 border-t border-black/5 pt-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Today&apos;s active rate</p>
    {settings?.usdToEgpRate != null ? (
      <>
        <p className="mt-1 text-2xl font-semibold">1 USD = {settings.usdToEgpRate} EGP</p>
        <p className="mt-1 text-xs text-black/40">
          {rateLastSetBy
            ? `Last updated ${formatDateTime(rateLastSetBy.createdAt)} by ${rateLastSetBy.admin?.email ?? "an admin"}`
            : "Every new checkout converts using this rate."}
        </p>
      </>
    ) : (
      <p className="mt-1 text-sm font-semibold text-red-600">
        Not configured — checkout will fail until a rate is set below.
      </p>
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
</section>

<div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Store settings</h2><p className="mt-1 text-xs text-black/40">Applied to new orders only.</p><form action={updateStoreSettingsAction} className="mt-6 space-y-4"><input type="hidden" name="usdToEgpRate" value={settings?.usdToEgpRate ?? ""} /><label className="block text-sm font-medium">Store name<input name="storeName" defaultValue={storeName} required className="mt-2 h-11 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Payment currency code<input name="currency" defaultValue={currencyCode} minLength={3} maxLength={3} required className="mt-2 h-11 w-full rounded-xl border border-black/10 px-4 uppercase outline-none focus:border-black"/><span className="mt-1 block text-[11px] leading-4 text-black/40">Internal reconciliation code for payment retries. Paymob currently charges in EGP only — keep this as EGP.</span></label><label className="block text-sm font-medium">Tax rate (%)<input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={taxRate} required className="mt-2 h-11 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"/></label></div><label className="block text-sm font-medium">Flat shipping ({PRICING_CURRENCY})<input name="shipping" type="number" min="0" step="0.01" defaultValue={shipping} required className="mt-2 h-11 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"/></label><button className="h-11 w-full rounded-xl bg-[#111827] text-sm font-semibold text-white">Save settings</button></form></section><section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Paymob configuration</h2><p className="mt-1 text-xs text-black/40">Secrets are read from server environment variables and are never displayed.</p><div className="mt-6 space-y-3">{credentials.map(([label, name]) => <div key={name} className="flex items-center justify-between rounded-xl bg-[#f8f8f8] p-4"><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 font-mono text-[10px] text-black/35">{name}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${configured(name) ? "bg-emerald-100 text-emerald-700" : name === "PAYMOB_WALLET_INTEGRATION_ID" ? "bg-black/5 text-black/40" : "bg-red-100 text-red-700"}`}>{configured(name) ? "CONFIGURED" : name === "PAYMOB_WALLET_INTEGRATION_ID" ? "OPTIONAL" : "MISSING"}</span></div>)}</div><div className="mt-5 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">Set the processed callback to <strong>/api/payments/paymob/webhook</strong> and the response callback to <strong>/api/payments/paymob/verify</strong> in Paymob.</div></section></div></div></main>;
}
