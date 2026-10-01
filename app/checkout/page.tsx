"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  COUNTRIES,
  DEFAULT_COUNTRY_CODE,
  composeInternationalPhone,
  countryFlag,
  findCountry,
} from "src/lib/geo/countries";

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
  // Customer-facing product name ("Customised T-shirt" etc.) and the best
  // available picture of the build -- see app/api/build/[id]/route.ts.
  displayName?: string;
  thumbnailUrl?: string | null;
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
    subtotalPaymentCents: number;
    totalPaymentCents: number;
    exchangeRate: number;
  } | null;
  walletEnabled?: boolean;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

function titleCase(value: string | null) {
  if (!value) return "-";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type PaymentMethod = "CARD" | "WALLET";

// text-base (16px) below sm: iOS Safari zooms the page into any field
// whose font is under 16px when it's focused.
const inputClass =
  "mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-base font-normal outline-none focus:border-black disabled:bg-black/[0.03] disabled:text-black/60 sm:text-sm";

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
  // here via the checkout redirect instead. createCheckoutOrder validates
  // it and otherwise defaults to "M".
  const sizeParam = searchParams.get("size");
  const size = sizeParam && ["S", "M", "L", "XL"].includes(sizeParam) ? sizeParam : "M";
  const { data: session, status } = useSession();

  const [quote, setQuote] = useState<BuildQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [addressCountry, setAddressCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  // Set once Paymob returns a card payment URL: the hosted card form is then
  // embedded below the details form instead of navigating away, so checkout
  // stays one continuous page.
  const [cardFrameUrl, setCardFrameUrl] = useState<string | null>(null);
  const [cardFrameLoaded, setCardFrameLoaded] = useState(false);

  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    if (buildId) params.set("buildId", buildId);
    if (sizeParam) params.set("size", size);
    const query = params.toString();
    return `/login?callbackUrl=${encodeURIComponent(`/checkout${query ? `?${query}` : ""}`)}`;
  }, [buildId, size, sizeParam]);

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

  function changeAddressCountry(code: string) {
    setAddressCountry(code);
    // Most customers' phone number shares the delivery country -- follow it
    // until they've started typing a number.
    if (!phoneNumber) setPhoneCountry(code);
  }

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
            phone: composeInternationalPhone(findCountry(phoneCountry)?.dial ?? "", phoneNumber),
          },
          shippingAddress: {
            country: addressCountry,
            line1: addressLine1,
            line2: addressLine2,
            city: addressCity,
            region: addressRegion,
            postalCode: addressPostalCode,
          },
        }),
      });
      const data = await response.json().catch(() => null);

      if (typeof data?.orderId === "string") setOrderId(data.orderId);

      if (response.ok && data?.paymentUrl) {
        if (method === "CARD") {
          setCardFrameLoaded(false);
          setCardFrameUrl(data.paymentUrl);
          setSubmitting(false);
          return;
        }
        // Wallet payments have no embeddable form -- Paymob hands back a
        // redirect to the wallet provider. Leave submitting=true through
        // the navigation so the button doesn't flash usable again.
        window.location.assign(data.paymentUrl);
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
  const totals = quote.totals;
  // No totals means the store's exchange rate is unconfigured, which
  // createCheckoutOrder rejects with a 503 anyway -- block the submit here
  // rather than sending the customer into a guaranteed failure.
  const canPay = quote.price.mode === "standard" && totals != null;
  const detailsLocked = cardFrameUrl != null;
  const selectedPhoneCountry = findCountry(phoneCountry);
  const productName = quote.displayName ?? quote.build.name ?? "T-shirt";

  // Every figure the customer sees is in the currency Paymob actually
  // charges, so the summary and the card form can never disagree. Subtotal
  // and total are each converted once server-side; shipping is converted
  // here and tax takes the remainder, so the lines always sum to the total.
  let breakdown: { subtotal: number; shipping: number; tax: number; total: number } | null = null;
  if (totals) {
    const shipping = Math.round(totals.shippingUsdCents * totals.exchangeRate);
    const tax =
      totals.taxUsdCents > 0 ? totals.totalPaymentCents - totals.subtotalPaymentCents - shipping : 0;
    breakdown = {
      subtotal: totals.subtotalPaymentCents,
      shipping: totals.taxUsdCents > 0 ? shipping : totals.totalPaymentCents - totals.subtotalPaymentCents,
      tax,
      total: totals.totalPaymentCents,
    };
  }

  return (
    <main className="min-h-screen bg-[#f5f4f0] px-3 pb-10 pt-16 text-black sm:px-4 sm:py-10">
      <div className="mx-auto grid max-w-6xl gap-5 sm:gap-7 lg:grid-cols-[1fr_380px]">
        <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">Secure checkout</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Complete your order</h1>

          {/* Phones and tablets: the full summary sits below the form, so
              show what's being bought and the total up front. */}
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#f5f4f0] p-3 lg:hidden">
            <div className="flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
              {quote.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- auth-gated API image, not optimizable
                <img src={quote.thumbnailUrl} alt="" className="h-full w-full object-contain" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{productName}</p>
              <p className="truncate text-xs text-black/50">
                {titleCase(draft.color)} · Size {size} · Qty {draft.quantity}
              </p>
            </div>
            {breakdown && totals ? (
              <p className="shrink-0 text-sm font-semibold">{money(breakdown.total, totals.paymentCurrency)}</p>
            ) : null}
          </div>

          {status === "unauthenticated" ? (
            <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              You need to sign in before payment.
              <Link href={loginHref} className="ml-2 font-semibold underline">
                Sign in
              </Link>
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-7">
            <fieldset disabled={detailsLocked} className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-black/45">Contact</h2>
                <label className="block text-sm font-medium">
                  Full name
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    required
                    autoComplete="name"
                    className={inputClass}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Email
                    <input
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      required
                      type="email"
                      autoComplete="email"
                      className={inputClass}
                    />
                  </label>
                  <div className="block text-sm font-medium">
                    <label htmlFor="checkout-phone">Phone</label>
                    <div className="mt-2 flex h-12 overflow-hidden rounded-xl border border-black/10 focus-within:border-black">
                      <div className="relative flex shrink-0 items-center gap-1.5 border-r border-black/10 bg-black/[0.02] pl-3 pr-2 font-normal">
                        <span aria-hidden>{countryFlag(phoneCountry)}</span>
                        <span aria-hidden>+{selectedPhoneCountry?.dial}</span>
                        <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 text-black/40">
                          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        <select
                          aria-label="Phone country code"
                          value={phoneCountry}
                          onChange={(event) => setPhoneCountry(event.target.value)}
                          autoComplete="tel-country-code"
                          className="absolute inset-0 cursor-pointer text-base opacity-0 disabled:cursor-default"
                        >
                          {COUNTRIES.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.name} (+{country.dial})
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        id="checkout-phone"
                        value={phoneNumber}
                        onChange={(event) => setPhoneNumber(event.target.value)}
                        required
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        placeholder="Phone number"
                        className="min-w-0 flex-1 bg-white px-3 text-base font-normal outline-none disabled:bg-black/[0.03] disabled:text-black/60 sm:text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-black/45">Delivery address</h2>
                <label className="block text-sm font-medium">
                  Country
                  <select
                    value={addressCountry}
                    onChange={(event) => changeAddressCountry(event.target.value)}
                    required
                    autoComplete="country"
                    className={inputClass}
                  >
                    {COUNTRIES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {countryFlag(country.code)} {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Street address
                  <input
                    value={addressLine1}
                    onChange={(event) => setAddressLine1(event.target.value)}
                    required
                    autoComplete="address-line1"
                    placeholder="Street and building number"
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Apartment, floor, etc. <span className="font-normal text-black/40">(optional)</span>
                  <input
                    value={addressLine2}
                    onChange={(event) => setAddressLine2(event.target.value)}
                    autoComplete="address-line2"
                    className={inputClass}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm font-medium">
                    City
                    <input
                      value={addressCity}
                      onChange={(event) => setAddressCity(event.target.value)}
                      required
                      autoComplete="address-level2"
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    State / region <span className="font-normal text-black/40">(optional)</span>
                    <input
                      value={addressRegion}
                      onChange={(event) => setAddressRegion(event.target.value)}
                      autoComplete="address-level1"
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Postal code <span className="font-normal text-black/40">(optional)</span>
                    <input
                      value={addressPostalCode}
                      onChange={(event) => setAddressPostalCode(event.target.value)}
                      autoComplete="postal-code"
                      className={inputClass}
                    />
                  </label>
                </div>
              </div>

              {/* Card is normally the only method, so there's nothing to
                  choose -- the selector only appears when mobile wallets are
                  enabled as a second option. */}
              {quote.walletEnabled ? (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-black/45">Pay with</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["CARD", "WALLET"] as const).map((item) => (
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
              ) : null}
            </fieldset>

            <div className="mt-8 space-y-4">
              {quote.price.mode !== "standard" ? (
                <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{quote.price.message}</div>
              ) : null}
              {error ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

              {detailsLocked ? null : (
                <button
                  type="submit"
                  disabled={!canPay || submitting || status === "loading"}
                  className="h-12 w-full rounded-xl bg-black text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting
                    ? "Preparing secure payment..."
                    : breakdown && totals
                      ? `Continue to payment · ${money(breakdown.total, totals.paymentCurrency)}`
                      : "Continue to payment"}
                </button>
              )}
            </div>
          </form>

          {cardFrameUrl ? (
            <div className="mt-8 border-t border-black/10 pt-8">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-black/45">Card details</h2>
                <button
                  type="button"
                  onClick={() => setCardFrameUrl(null)}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Edit details
                </button>
              </div>
              <div className="relative mt-4 overflow-hidden rounded-xl border border-black/10 bg-white">
                {cardFrameLoaded ? null : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  </div>
                )}
                <iframe
                  key={cardFrameUrl}
                  src={cardFrameUrl}
                  title="Secure card payment"
                  onLoad={() => setCardFrameLoaded(true)}
                  allow="payment"
                  className="block h-[680px] w-full"
                />
              </div>
              <p className="mt-3 text-xs text-black/45">
                Card details are entered on Paymob&apos;s secure form and never touch our servers.
              </p>
            </div>
          ) : null}
        </section>

        <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm lg:sticky lg:top-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">Order summary</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f5f4f0]">
              {quote.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- auth-gated API image, not optimizable
                <img src={quote.thumbnailUrl} alt={productName} className="h-full w-full object-contain" />
              ) : null}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{productName}</h2>
              <p className="mt-1 text-sm text-black/45">
                {titleCase(draft.product)} · {titleCase(draft.color)} · Size {size}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-black/45">Fabric</span>
              <strong>{titleCase(draft.fabric)}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-black/45">Quantity</span>
              <strong>{draft.quantity}</strong>
            </div>
          </div>
          <div className="mt-5 space-y-2 border-t border-black/10 pt-5 text-sm">
            {breakdown && totals ? (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-black/45">Subtotal</span>
                  <span>{money(breakdown.subtotal, totals.paymentCurrency)}</span>
                </div>
                {breakdown.tax > 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-black/45">Tax</span>
                    <span>{money(breakdown.tax, totals.paymentCurrency)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <span className="text-black/45">Shipping</span>
                  <span>{breakdown.shipping > 0 ? money(breakdown.shipping, totals.paymentCurrency) : "Free"}</span>
                </div>
                <div className="flex justify-between border-t border-black/10 pt-3 text-lg font-semibold">
                  <span>Total</span>
                  <span>{money(breakdown.total, totals.paymentCurrency)}</span>
                </div>
                <p className="text-xs text-black/45">
                  ≈ {money(totals.totalUsdCents, "USD")} · charged in {totals.paymentCurrency}
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
