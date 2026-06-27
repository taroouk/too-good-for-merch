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
  walletEnabled?: boolean;
};

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
  const { data: session, status } = useSession();

  const [quote, setQuote] = useState<BuildQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const response = await fetch("/api/payments/paymob/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buildId,
        method,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
        },
      }),
    });
    const data = await response.json().catch(() => null);

    if (response.ok && data?.paymentUrl) {
      window.location.assign(data.paymentUrl);
      return;
    }

    setSubmitting(false);
    setError(data?.error ?? "Could not start payment.");
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
          <Link href="/studio" className="mt-6 inline-flex rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            Back to studio
          </Link>
        </section>
      </main>
    );
  }

  const draft = quote.build.draft;
  const canPay = quote.price.mode === "standard";
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
          <div className="mt-5 border-t border-black/10 pt-5">
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>
                {quote.price.mode === "standard"
                  ? `${quote.price.currency} ${quote.price.total.toFixed(2)}`
                  : quote.price.message}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
