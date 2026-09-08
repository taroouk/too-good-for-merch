"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

type BuildQuote = {
  build: {
    id: string;
    name: string | null;
    draft: {
      product: string | null;
      color: string | null;
      fabric: string | null;
      quantity: number;
    };
  };
  price:
    | { mode: "standard"; unit: number; total: number; currency: string }
    | { mode: "custom" | "bulk"; unit: null; total: null; currency: string; message: string };
  // Tax/shipping-inclusive breakdown plus the payment-currency conversion,
  // computed server-side by the same helper createCheckoutOrder uses. Null
  // when the build isn't priceable or the store's exchange rate is
  // unconfigured -- render price.message / a fallback rather than a total.
  totals: {
    subtotalUsdCents: number;
    taxUsdCents: number;
    shippingUsdCents: number;
    totalUsdCents: number;
    paymentCurrency: string;
    totalPaymentCents: number;
    exchangeRate: number;
  } | null;
  walletEnabled?: boolean;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

type PaymentMethod = "CARD" | "WALLET";

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f5f4f0]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-black border-t-transparent" />
        </main>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const buildId = searchParams.get("buildId");
  // The Studio Builder's size selector (S/M/L/XL) has no field on
  // BuildDraft to persist to (see WishlistItem.size / BespokeRequest.size in
  // prisma/schema.prisma -- size is only ever snapshotted at the point of a
  // real action, not stored on the in-progress draft), so it's forwarded
  // here via the checkout redirect instead. createCheckoutOrder (called
  // below) already accepts and validates a `size` field and otherwise
  // silently defaults to "M" -- previously nothing on this page ever sent
  // one, so every standard order was created as size M regardless of what
  // the customer picked in the Builder.
  const sizeParam = searchParams.get("size");
  const size = sizeParam && ["S", "M", "L", "XL"].includes(sizeParam) ? sizeParam : "M";
  const { data: session, status } = useSession();

  const [quote, setQuote] = useState<BuildQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const loginHref = useMemo(() => {
    const callbackUrl = `/checkout${buildId ? `?buildId=${encodeURIComponent(buildId)}` : ""}`;
    return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }, [buildId]);

  useEffect(() => {
    if (session?.user?.email && !customerEmail) setCustomerEmail(session.user.email);
  }, [customerEmail, session?.user?.email]);

  useEffect(() => {
    if (quote && !quote.walletEnabled && method === "WALLET") setMethod("CARD");
  }, [method, quote]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!buildId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/build/${encodeURIComponent(buildId)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Could not load this build.");
        if (!cancelled) setQuote(data);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load checkout.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [buildId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || quote.price.mode !== "standard" || !buildId) return;
    if (status !== "authenticated") {
      window.location.assign(loginHref);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Reuse the order created by a previous attempt (if any) instead of
      // creating a new one on every retry - the server only creates a fresh
      // order when no orderId is provided.
      const response = await fetch("/api/payments/paymob/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderId ?? undefined,
          buildId,
          size,
          method,
          customer: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
          },
        }),
      });
      const data = await response.json().catch(() => null);

      if (typeof data?.orderId === "string") setOrderId(data.orderId);

      if (response.ok && data?.paymentUrl) {
        window.location.assign(data.paymentUrl);
        // Intentionally leave submitting=true -- the page is navigating
        // away to Paymob, so the button should stay disabled through that
        // transition rather than flash usable again beforehand.
        return;
      }

      // A stale/terminal order (already paid, or its currency gone stale
      // relative to current settings - create-intent's own 409 checks)
      // can never succeed by resubmitting the SAME orderId, so drop it for
      // a fresh attempt next time. Excludes PAYMENT_ALREADY_IN_PROGRESS,
      // which is also a 409 but means a sibling request (double click, a
      // second tab) is already mid-flight for this exact order - clearing
      // orderId there would abandon it and risk creating a second,
      // duplicate order instead of waiting for/reusing the first.
      if (response.status === 409 && data?.code !== "PAYMENT_ALREADY_IN_PROGRESS") {
        setOrderId(null);
      }

      setSubmitting(false);
      setError(data?.error ?? "Could not start payment.");
    } catch {
      // fetch() itself rejected (offline, DNS failure, connection reset) -
      // as opposed to the API responding with an HTTP error, handled above.
      // Without this catch, submitting never resets and the button is
      // stuck disabled/"Connecting to Paymob..." until a page reload.
      setSubmitting(false);
      setError("Could not reach the payment service. Check your connection and try again.");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f4f0]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-black border-t-transparent" />
      </main>
    );
  }

  if (!buildId || !quote) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f4f0] px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Checkout unavailable</h1>
          <p className="mt-2 text-sm text-black/55">{error ?? "No build was selected."}</p>
          <a href="/studio" className="mt-6 inline-flex rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            Back to studio
          </a>
        </section>
      </main>
    );
  }

  const draft = quote.build.draft;
  // No totals means the store's exchange rate is unconfigured, which
  // createCheckoutOrder rejects with a 503 anyway -- block the submit here
  // rather than sending the customer into a guaranteed failure.
  const canPay = quote.price.mode === "standard" && quote.totals != null;
  const availablePaymentMethods: PaymentMethod[] = quote.walletEnabled
    ? ["CARD", "WALLET"]
    : ["CARD"];

  return (
    <main className="min-h-screen bg-[#f5f4f0] px-4 py-10 text-black">
      <div className="mx-auto grid max-w-6xl gap-7 lg:grid-cols-[1fr_380px]">
        <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">Secure checkout</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Complete your order</h1>
          <p className="mt-2 text-sm text-black/50">
            We calculate the final price on the server and send you to Paymob for card details.
          </p>

          {status === "unauthenticated" ? (
            <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              You need to sign in before payment.
              <Link href={loginHref} className="ml-2 font-semibold underline">
                Sign in
              </Link>
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-7 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Full name
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  required
                  autoComplete="name"
                  className="mt-2 h-12 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"
                />
              </label>
              <label className="block text-sm font-medium">
                Phone
                <input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  required
                  autoComplete="tel"
                  placeholder="+20..."
                  className="mt-2 h-12 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Email
              <input
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                required
                type="email"
                autoComplete="email"
                className="mt-2 h-12 w-full rounded-xl border border-black/10 px-4 outline-none focus:border-black"
              />
            </label>

            <div>
              <p className="text-sm font-medium">Payment method</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {availablePaymentMethods.map((item) => (
                  <label
                    key={item}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-semibold ${
                      method === item ? "border-black bg-black text-white" : "border-black/10 bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={item}
                      checked={method === item}
                      onChange={() => setMethod(item)}
                    />
                    {item === "CARD" ? "Card" : "Mobile wallet"}
                  </label>
                ))}
              </div>
            </div>

            {quote.price.mode !== "standard" ? (
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{quote.price.message}</div>
            ) : null}
            {error ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

            <button
              type="submit"
              disabled={!canPay || submitting || status === "loading"}
              className="h-12 w-full rounded-xl bg-black text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Connecting to Paymob..." : "Continue to secure payment"}
            </button>
          </form>
        </section>

        <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">Order summary</p>
          <h2 className="mt-2 text-xl font-semibold">{quote.build.name ?? "Studio build"}</h2>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-black/45">Product</span>
              <strong>{draft.product ?? "-"}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-black/45">Color</span>
              <strong>{draft.color ?? "-"}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-black/45">Fabric</span>
              <strong>{draft.fabric ?? "-"}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-black/45">Quantity</span>
              <strong>{draft.quantity}</strong>
            </div>
          </div>
          <div className="mt-5 space-y-2 border-t border-black/10 pt-5 text-sm">
            {quote.totals ? (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-black/45">Subtotal</span>
                  <span>{money(quote.totals.subtotalUsdCents, "USD")}</span>
                </div>
                {quote.totals.taxUsdCents > 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-black/45">Tax</span>
                    <span>{money(quote.totals.taxUsdCents, "USD")}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <span className="text-black/45">Shipping</span>
                  <span>
                    {quote.totals.shippingUsdCents > 0
                      ? money(quote.totals.shippingUsdCents, "USD")
                      : "Free"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-black/10 pt-3 text-lg font-semibold">
                  <span>Total</span>
                  <span>{money(quote.totals.totalUsdCents, "USD")}</span>
                </div>
                <p className="text-xs text-black/45">
                  Paymob charge: {money(quote.totals.totalPaymentCents, quote.totals.paymentCurrency)}
                </p>
                <p className="text-xs text-black/45">
                  Exchange rate: 1 USD = {quote.totals.exchangeRate} {quote.totals.paymentCurrency}
                </p>
              </>
            ) : (
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>
                  {quote.price.mode === "standard"
                    ? "Unavailable right now"
                    : quote.price.message}
                </span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
