import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "src/lib/prisma";

type CheckoutPageProps = {
  params: Promise<{ orderId: string }>;
};

const PRODUCT_LABELS: Record<string, string> = {
  FITTED: "Fitted",
  OVERSIZED: "Oversized",
  CUSTOM: "Bespoke",
};

const FABRIC_LABELS: Record<string, string> = {
  ESSENTIALS_170: "Essentials · 170 GSM",
  SIGNATURE_200: "Signature · 200 GSM",
  HEAVYWEIGHT_300: "Heavyweight · 300 GSM",
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function readablePlacement(value: unknown): string {
  if (!Array.isArray(value)) return "Centre front";
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) =>
      item
        .toLowerCase()
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(", ");
}

function selectedSize(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "M";
  const size = (value as { size?: unknown }).size;
  return typeof size === "string" ? size : "M";
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5 10.5 3.1 3L15 6.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      build: { select: { id: true, name: true } },
    },
  });

  if (!order) notFound();

  const item = order.items[0];
  const total = money(order.totalCents, order.currency);
  const subtotal = money(order.subtotalCents, order.currency);

  return (
    <main className="checkout-page">
      <header className="checkout-header">
        <Link href="/" className="checkout-brand" aria-label="Too Good For Merch home">
          <img src="/logo.svg" alt="Too Good For Merch" />
        </Link>

        <div className="checkout-header-meta">
          <span className="checkout-lock" aria-hidden="true">⌾</span>
          Secure checkout
        </div>
      </header>

      <div className="checkout-progress" aria-label="Checkout progress">
        <div className="checkout-progress-step checkout-progress-step-active">
          <span>1</span>
          Details
        </div>
        <div className="checkout-progress-line" />
        <div className="checkout-progress-step">
          <span>2</span>
          Payment
        </div>
        <div className="checkout-progress-line" />
        <div className="checkout-progress-step">
          <span>3</span>
          Confirmation
        </div>
      </div>

      <div className="checkout-layout">
        <section className="checkout-content">
          <div className="checkout-intro">
            <p className="checkout-kicker">Almost yours</p>
            <h1>Complete your order.</h1>
            <p>Tell us where to reach you. You’ll review payment securely on the next step.</p>
          </div>

          <form action="/api/payments/paymob/create" method="POST" className="checkout-form">
            <input type="hidden" name="orderId" value={order.id} />

            <div className="checkout-section-heading">
              <span>01</span>
              <div>
                <h2>Contact information</h2>
                <p>For your receipt and production updates.</p>
              </div>
            </div>

            <div className="checkout-fields">
              <label className="checkout-field checkout-field-wide">
                <span>Full name</span>
                <input
                  name="customerName"
                  type="text"
                  required
                  autoComplete="name"
                  defaultValue={order.customerName ?? ""}
                  placeholder="Your full name"
                />
              </label>

              <label className="checkout-field">
                <span>Email address</span>
                <input
                  name="customerEmail"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={order.customerEmail ?? ""}
                  placeholder="you@example.com"
                />
              </label>

              <label className="checkout-field">
                <span>Phone number</span>
                <input
                  name="customerPhone"
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  defaultValue={order.customerPhone ?? ""}
                  placeholder="+20 10 1234 5678"
                />
              </label>
            </div>

            <div className="checkout-section-heading checkout-payment-heading">
              <span>02</span>
              <div>
                <h2>Payment</h2>
                <p>Your payment details are handled securely by Paymob.</p>
              </div>
            </div>

            <div className="checkout-payment-card">
              <div className="checkout-payment-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <div>
                <strong>Card or wallet payment</strong>
                <p>Continue to choose your preferred payment method.</p>
              </div>
              <span className="checkout-payment-check"><CheckIcon /></span>
            </div>

            <button type="submit" className="checkout-submit">
              <span>Continue to secure payment</span>
              <span>{total} <b>→</b></span>
            </button>

            <div className="checkout-assurances">
              <span><CheckIcon /> Secure payment</span>
              <span><CheckIcon /> Production reviewed by our team</span>
              <span><CheckIcon /> Order support included</span>
            </div>
          </form>
        </section>

        <aside className="checkout-summary">
          <div className="checkout-summary-top">
            <div>
              <p className="checkout-kicker">Your bag</p>
              <h2>Order summary</h2>
            </div>
            <span>1 item</span>
          </div>

          {item ? (
            <div className="checkout-product">
              <div className="checkout-product-type">
                <span>Product type</span>
                <strong>{PRODUCT_LABELS[item.product] ?? item.product}</strong>
              </div>

              <div className="checkout-product-copy">
                <p>{FABRIC_LABELS[item.fabric] ?? item.fabric}</p>
                <dl>
                  <div><dt>Colour</dt><dd>{item.color.toLowerCase()}</dd></div>
                  <div><dt>Size</dt><dd>{selectedSize(item.preview)}</dd></div>
                  <div><dt>Quantity</dt><dd>{item.quantity}</dd></div>
                  <div><dt>Print</dt><dd>{readablePlacement(item.placements)}</dd></div>
                </dl>
              </div>
            </div>
          ) : null}

          <div className="checkout-totals">
            <div><span>Subtotal</span><strong>{subtotal}</strong></div>
            <div><span>Shipping</span><strong>Confirmed after review</strong></div>
            <div className="checkout-total"><span>Total</span><strong>{total}</strong></div>
          </div>

          <p className="checkout-summary-note">
            Shipping and production timing are confirmed by our team before your order enters production.
          </p>

          {order.buildId ? (
            <Link href={`/studio/projects/${order.buildId}/builder`} className="checkout-edit-link">
              ← Edit your design
            </Link>
          ) : null}

          <div className="checkout-order-ref">
            <span>Order reference</span>
            <strong>{order.orderNumber}</strong>
          </div>
        </aside>
      </div>

      <footer className="checkout-footer">
        <span>© {new Date().getFullYear()} Too Good For Merch</span>
        <a href="mailto:hello@toogoodformerch.com">Need help? Talk to us</a>
      </footer>
    </main>
  );
}
