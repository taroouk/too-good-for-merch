import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { buildStandardOrderEmail } from "src/lib/emails/order-emails";

type MockPaymentPageProps = {
  searchParams: Promise<{
    orderId?: string;
    result?: "success" | "failure";
  }>;
};

const PRODUCT_LABELS: Record<string, string> = {
  FITTED: "Fitted tee",
  OVERSIZED: "Oversized tee",
  CUSTOM: "Bespoke tee",
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function selectedSize(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "M";
  const size = (value as { size?: unknown }).size;
  return typeof size === "string" ? size : "M";
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.75" y="5" width="18.5" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9.25h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default async function MockPaymentPage({ searchParams }: MockPaymentPageProps) {
  const params = await searchParams;

  if (!params.orderId) redirect("/studio/projects");

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true },
  });

  if (!order) redirect("/studio/projects");

  if (params.result === "success") {
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        paymobTransactionId: `mock_tx_${Date.now()}`,
      },
      include: { items: true },
    });

    const confirmationEmail = buildStandardOrderEmail({
      firstName: updatedOrder.customerName?.split(" ")[0] ?? "there",
      orderNumber: updatedOrder.orderNumber,
      placedOn: formatDate(updatedOrder.createdAt),
      items: updatedOrder.items.map((item) => ({
        name: PRODUCT_LABELS[item.product] ?? "Custom T-Shirt",
        quantity: item.quantity,
        details: `${item.product}, Colour: ${item.color}`,
        priceText: money(item.unitPriceCents, updatedOrder.currency),
      })),
      subtotalText: money(updatedOrder.subtotalCents, updatedOrder.currency),
      shippingText: "TBC",
      totalText: money(updatedOrder.totalCents, updatedOrder.currency),
      shippingTo: {
        fullName: updatedOrder.customerName ?? "Customer Name",
        addressLine1: "Address to be confirmed",
        city: "City to be confirmed",
        country: "Country to be confirmed",
      },
    });

    console.log("STANDARD ORDER CONFIRMATION EMAIL:");
    console.log(confirmationEmail);
    redirect(`/orders/${order.id}/success`);
  }

  if (params.result === "failure") {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
    redirect(`/orders/${order.id}/failed`);
  }

  const item = order.items[0];
  const total = money(order.totalCents, order.currency);

  return (
    <main className="payment-page">
      <header className="payment-header">
        <Link href="/" className="payment-brand" aria-label="Too Good For Merch home">
          <img src="/logo.svg" alt="Too Good For Merch" />
        </Link>
        <div className="payment-secure"><span>⌾</span> Secure payment</div>
      </header>

      <div className="payment-shell">
        <div className="payment-title">
          <p>Final step</p>
          <h1>Choose how you’d like to pay.</h1>
          <span>Your order is reserved while you complete payment.</span>
        </div>

        <div className="payment-layout">
          <section className="payment-method-card">
            <div className="payment-test-banner">
              <span>Test mode</span>
              This screen safely simulates Paymob during development. No card details are required.
            </div>

            <div className="payment-section-title">
              <span>01</span>
              <div>
                <h2>Payment method</h2>
                <p>Choose your preferred secure payment option.</p>
              </div>
            </div>

            <div className="payment-method-selected">
              <div className="payment-method-icon"><CardIcon /></div>
              <div>
                <strong>Card or mobile wallet</strong>
                <p>Visa, Mastercard, Meeza and supported wallets</p>
              </div>
              <span className="payment-radio" />
            </div>

            <div className="payment-provider-box">
              <div>
                <span>PAYMENT POWERED BY</span>
                <strong>paymob</strong>
              </div>
              <div className="payment-networks" aria-label="Supported card networks">
                <b>VISA</b><b>mastercard.</b><b>MEEZA</b>
              </div>
            </div>

            <Link
              href={`/payment/mock?orderId=${order.id}&result=success`}
              className="payment-confirm"
            >
              <span>Confirm secure payment</span>
              <span>{total} <b>→</b></span>
            </Link>

            <div className="payment-security-note">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12a2 2 0 0 1 2 2v7H4v-7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <p><strong>Your payment is protected.</strong> Payment information is encrypted and handled securely by Paymob.</p>
            </div>

            <Link
              href={`/payment/mock?orderId=${order.id}&result=failure`}
              className="payment-decline-test"
            >
              Simulate a declined payment
            </Link>
          </section>

          <aside className="payment-summary-card">
            <div className="payment-summary-head">
              <div>
                <p>Order summary</p>
                <h2>{order.orderNumber}</h2>
              </div>
              <span>1 item</span>
            </div>

            {item ? (
              <div className="payment-product">
                <span>Product type</span>
                <strong>{PRODUCT_LABELS[item.product] ?? item.product}</strong>
                <dl>
                  <div><dt>Colour</dt><dd>{item.color.toLowerCase()}</dd></div>
                  <div><dt>Size</dt><dd>{selectedSize(item.preview)}</dd></div>
                  <div><dt>Quantity</dt><dd>{item.quantity}</dd></div>
                </dl>
              </div>
            ) : null}

            <div className="payment-customer">
              <p>Paying as</p>
              <strong>{order.customerName ?? "TGFM customer"}</strong>
              <span>{order.customerEmail ?? order.customerPhone ?? "Contact details saved"}</span>
            </div>

            <div className="payment-total-row">
              <span>Total due</span>
              <strong>{total}</strong>
            </div>

            <Link href={`/orders/${order.id}/checkout`} className="payment-back-link">
              ← Back to checkout details
            </Link>
          </aside>
        </div>
      </div>

      <footer className="payment-footer">
        <span>© {new Date().getFullYear()} Too Good For Merch</span>
        <a href="mailto:hello@toogoodformerch.com">Need payment help?</a>
      </footer>
    </main>
  );
}
