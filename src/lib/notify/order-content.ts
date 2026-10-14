// Pure builders for the order payment-confirmation email. No network, no
// Prisma -- unit tested in src/lib/notify/__tests__/order.test.ts. Sending
// lives in src/lib/notify/order.ts.

export type OrderEmailItem = {
  product: string;
  color: string;
  fabric: string;
  quantity: number;
  unitPriceLabel: string;
  totalLabel: string;
  placements: string[];
};

export type OrderEmailView = {
  orderNumber: string;
  customerName: string | null;
  items: OrderEmailItem[];
  subtotalLabel: string;
  shippingTaxLabel: string | null;
  totalLabel: string;
  addressLines: string[];
  orderUrl: string | null;
  supportEmail: string;
  supportWhatsappUrl: string | null;
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// FITTED -> "Fitted", HEAVYWEIGHT_300 -> "Heavyweight 300"
export function humanizeKey(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function itemLine(item: OrderEmailItem): string {
  const spec = [humanizeKey(item.product), humanizeKey(item.color), humanizeKey(item.fabric)].join(" · ");
  const where = item.placements.length ? ` — ${item.placements.map(humanizeKey).join(", ")}` : "";
  return `${item.quantity} × ${spec}${where}`;
}

export function buildOrderConfirmationEmail(view: OrderEmailView): { subject: string; html: string; text: string } {
  const greeting = view.customerName ? `Hi ${view.customerName},` : "Hi,";
  const subject = `Payment received — order ${view.orderNumber}`;

  const text = [
    greeting,
    "",
    `Thank you for your order. We've received your payment for order ${view.orderNumber} and it's now with our production team.`,
    "",
    "Your order",
    ...view.items.map((item) => `- ${itemLine(item)} (${item.totalLabel})`),
    "",
    `Subtotal: ${view.subtotalLabel}`,
    ...(view.shippingTaxLabel ? [`Shipping & tax: ${view.shippingTaxLabel}`] : []),
    `Total paid: ${view.totalLabel}`,
    ...(view.addressLines.length ? ["", "Delivery address", ...view.addressLines] : []),
    ...(view.orderUrl ? ["", `View your order: ${view.orderUrl}`] : []),
    "",
    `Questions? Reply to this email or contact ${view.supportEmail}${view.supportWhatsappUrl ? ` / WhatsApp ${view.supportWhatsappUrl}` : ""}.`,
    "",
    "Too Good For Merch",
  ].join("\n");

  const rows = view.items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${esc(itemLine(item))}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${esc(item.totalLabel)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#0b0b0b">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#777;margin:0">Too Good For Merch</p>
<h1 style="font-size:22px;margin:12px 0 8px">Payment received</h1>
<p style="margin:0 0 16px;line-height:1.5">${esc(greeting)}<br>Thank you for your order. We've received your payment for order <strong>${esc(view.orderNumber)}</strong> and it's now with our production team.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
<tr><td style="padding:8px 0;color:#555">Subtotal</td><td style="padding:8px 0;text-align:right">${esc(view.subtotalLabel)}</td></tr>
${view.shippingTaxLabel ? `<tr><td style="padding:8px 0;color:#555">Shipping &amp; tax</td><td style="padding:8px 0;text-align:right">${esc(view.shippingTaxLabel)}</td></tr>` : ""}
<tr><td style="padding:8px 0;font-weight:bold">Total paid</td><td style="padding:8px 0;text-align:right;font-weight:bold">${esc(view.totalLabel)}</td></tr></table>
${view.addressLines.length ? `<p style="margin:20px 0 4px;font-weight:bold;font-size:13px">Delivery address</p><p style="margin:0;line-height:1.5;font-size:14px">${view.addressLines.map(esc).join("<br>")}</p>` : ""}
${view.orderUrl ? `<p style="margin:24px 0 0"><a href="${esc(view.orderUrl)}" style="display:inline-block;background:#0b0b0b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:13px;font-weight:bold">View your order</a></p>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#777;line-height:1.5">Questions? Reply to this email or contact <a href="mailto:${esc(view.supportEmail)}" style="color:#777">${esc(view.supportEmail)}</a>${view.supportWhatsappUrl ? ` · <a href="${esc(view.supportWhatsappUrl)}" style="color:#777">WhatsApp</a>` : ""}.</p>
</div></body></html>`;

  return { subject, html, text };
}

export type ShippedEmailView = {
  orderNumber: string;
  customerName: string | null;
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  addressLines: string[];
  orderUrl: string | null;
  supportEmail: string;
};

export function buildOrderShippedEmail(view: ShippedEmailView): { subject: string; html: string; text: string } {
  const greeting = view.customerName ? `Hi ${view.customerName},` : "Hi,";
  const subject = `Your order ${view.orderNumber} is on its way`;

  const text = [
    greeting,
    "",
    `Good news — order ${view.orderNumber} has shipped.`,
    "",
    `Courier: ${view.carrier}`,
    ...(view.trackingNumber ? [`Tracking number: ${view.trackingNumber}`] : []),
    ...(view.trackingUrl ? [`Track your parcel: ${view.trackingUrl}`] : []),
    ...(view.addressLines.length ? ["", "Delivering to", ...view.addressLines] : []),
    ...(view.orderUrl ? ["", `View your order: ${view.orderUrl}`] : []),
    "",
    `Questions? Reply to this email or contact ${view.supportEmail}.`,
    "",
    "Too Good For Merch",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#0b0b0b">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#777;margin:0">Too Good For Merch</p>
<h1 style="font-size:22px;margin:12px 0 8px">Your order is on its way</h1>
<p style="margin:0 0 16px;line-height:1.5">${esc(greeting)}<br>Good news — order <strong>${esc(view.orderNumber)}</strong> has shipped.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="padding:8px 0;color:#555">Courier</td><td style="padding:8px 0;text-align:right">${esc(view.carrier)}</td></tr>
${view.trackingNumber ? `<tr><td style="padding:8px 0;color:#555">Tracking number</td><td style="padding:8px 0;text-align:right;font-family:monospace">${esc(view.trackingNumber)}</td></tr>` : ""}
</table>
${view.trackingUrl ? `<p style="margin:20px 0 0"><a href="${esc(view.trackingUrl)}" style="display:inline-block;background:#0b0b0b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:13px;font-weight:bold">Track your parcel</a></p>` : ""}
${view.addressLines.length ? `<p style="margin:20px 0 4px;font-weight:bold;font-size:13px">Delivering to</p><p style="margin:0;line-height:1.5;font-size:14px">${view.addressLines.map(esc).join("<br>")}</p>` : ""}
${view.orderUrl ? `<p style="margin:20px 0 0;font-size:13px"><a href="${esc(view.orderUrl)}" style="color:#0b0b0b">View your order</a></p>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#777;line-height:1.5">Questions? Reply to this email or contact <a href="mailto:${esc(view.supportEmail)}" style="color:#777">${esc(view.supportEmail)}</a>.</p>
</div></body></html>`;

  return { subject, html, text };
}
