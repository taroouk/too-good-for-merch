import { PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { sendEmail, type SendResult } from "src/lib/notify/email";
import { recordEmailFailure } from "src/lib/notify/email-failure";
import { buildOrderConfirmationEmail, buildOrderShippedEmail } from "src/lib/notify/order-content";
import { CONTACT_EMAIL, WHATSAPP_PHONE } from "src/lib/contact";
import { siteUrl } from "src/lib/site-url";
import { formatMoney, formatShippingAddress } from "src/lib/orders/display";

export type ConfirmationOutcome = SendResult | { sent: false; skipped: true; reason: string };

// Emails the customer that their payment was received. Safe to call from
// every place an order becomes PAID (webhook, manual mark-as-paid) and from
// the admin "resend" button:
//  - idempotent: Order.confirmationEmailSentAt is claimed atomically BEFORE
//    sending, so a redelivered webhook can't email twice;
//  - never throws: a delivery problem must not fail a payment webhook;
//  - a failed or skipped (no RESEND_API_KEY) send releases the claim so the
//    next trigger, or an admin resend, tries again.
export async function sendOrderConfirmationEmail(orderId: string, options: { force?: boolean } = {}): Promise<ConfirmationOutcome> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: { select: { email: true } } },
    });
    if (!order) return { sent: false, skipped: true, reason: "Order not found" };
    if (order.paymentStatus !== PaymentStatus.PAID) return { sent: false, skipped: true, reason: "Order is not paid" };
    // A payment that landed on an order the team already cancelled is handled
    // manually (refund or reinstate) -- never tell that customer it's in production.
    if (order.status === "CANCELLED") return { sent: false, skipped: true, reason: "Order is cancelled" };
    const to = order.customerEmail?.trim() || order.user?.email?.trim();
    if (!to) return { sent: false, skipped: true, reason: "No customer email on this order" };

    if (!options.force) {
      const claim = await prisma.order.updateMany({
        where: { id: orderId, confirmationEmailSentAt: null },
        data: { confirmationEmailSentAt: new Date() },
      });
      if (claim.count === 0) return { sent: false, skipped: true, reason: "Already sent" };
    }

    const base = siteUrl();
    const surcharge = order.totalCents - order.subtotalCents;
    const email = buildOrderConfirmationEmail({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      items: order.items.map((item) => ({
        product: item.product,
        color: item.color,
        fabric: item.fabric,
        quantity: item.quantity,
        unitPriceLabel: formatMoney(item.unitPriceCents, order.currency),
        totalLabel: formatMoney(item.totalCents, order.currency),
        placements: Array.isArray(item.placements) ? item.placements.filter((p): p is string => typeof p === "string") : [],
      })),
      subtotalLabel: formatMoney(order.subtotalCents, order.currency),
      shippingTaxLabel: surcharge > 0 ? formatMoney(surcharge, order.currency) : null,
      totalLabel: formatMoney(order.totalCents, order.currency),
      addressLines: formatShippingAddress(order),
      orderUrl: base ? `${base}/orders/${order.id}` : null,
      supportEmail: CONTACT_EMAIL,
      // Plain chat link: contact.ts's WHATSAPP_URL carries a pre-filled
      // "I'd love a quote" message that doesn't belong in an order email.
      supportWhatsappUrl: WHATSAPP_PHONE ? `https://wa.me/${WHATSAPP_PHONE}` : null,
    });

    const result = await sendEmail({ to, subject: email.subject, html: email.html, text: email.text, replyTo: CONTACT_EMAIL });
    if (!result.sent) await recordEmailFailure({ kind: "order-confirmation", to, orderId, reason: result.skipped ? result.reason : result.error });
    if (result.sent) {
      if (options.force) await prisma.order.update({ where: { id: orderId }, data: { confirmationEmailSentAt: new Date() } });
    } else if (!options.force) {
      await prisma.order.updateMany({ where: { id: orderId }, data: { confirmationEmailSentAt: null } });
    }
    return result;
  } catch (error) {
    console.error("[notify/order] confirmation email failed", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Tells the customer their parcel has shipped (courier + tracking). Sent
// when the admin marks the order shipped and on an explicit resend. Same
// contract as the confirmation: never throws.
export async function sendOrderShippedEmail(orderId: string): Promise<ConfirmationOutcome> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { email: true } } },
    });
    if (!order) return { sent: false, skipped: true, reason: "Order not found" };
    if (!order.carrier) return { sent: false, skipped: true, reason: "No courier recorded on this order" };
    const to = order.customerEmail?.trim() || order.user?.email?.trim();
    if (!to) return { sent: false, skipped: true, reason: "No customer email on this order" };

    const base = siteUrl();
    const email = buildOrderShippedEmail({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      addressLines: formatShippingAddress(order),
      orderUrl: base ? `${base}/orders/${order.id}` : null,
      supportEmail: CONTACT_EMAIL,
    });
    const shipped = await sendEmail({ to, subject: email.subject, html: email.html, text: email.text, replyTo: CONTACT_EMAIL });
    if (!shipped.sent) await recordEmailFailure({ kind: "order-shipped", to, orderId, reason: shipped.skipped ? shipped.reason : shipped.error });
    return shipped;
  } catch (error) {
    console.error("[notify/order] shipped email failed", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
