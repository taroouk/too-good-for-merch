// Pure message builders for Bespoke request notifications. No network, no
// Prisma -- unit-tested in src/lib/notify/__tests__/bespoke.test.ts. The
// orchestration that actually sends lives in src/lib/notify/bespoke.ts.

export type BespokeNotifyView = {
  requestNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  product: string | null;
  color: string | null;
  fabric: string | null;
  quantity: number;
  size: string | null;
  placements: string[];
  customNotes: string | null;
  createdAt: Date;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bespokeConfigLines(r: BespokeNotifyView): string[] {
  return [
    `Product: ${r.product ?? "—"}`,
    `Colour: ${r.color ?? "—"}`,
    `Fabric: ${r.fabric ?? "—"}`,
    `Quantity: ${r.quantity}`,
    `Size: ${r.size ?? "—"}`,
    `Placements: ${r.placements.length ? r.placements.join(", ") : "—"}`,
    ...(r.customNotes ? [`Notes: ${r.customNotes}`] : []),
  ];
}

// Confirmation sent to the customer.
export function buildBespokeCustomerEmail(r: BespokeNotifyView): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `We've received your bespoke request (${r.requestNumber})`;
  const lines = bespokeConfigLines(r);
  const text = [
    `Hi ${r.customerName},`,
    ``,
    `Thanks for your bespoke request. Our team will review the design and contact you at ${r.customerEmail} or ${r.customerPhone} with a tailored quote. No payment is needed right now.`,
    ``,
    `Reference: ${r.requestNumber}`,
    ``,
    `Your request:`,
    ...lines.map((l) => `  ${l}`),
    ``,
    `— Too Good For Merch`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p>Hi ${esc(r.customerName)},</p>
      <p>Thanks for your bespoke request. Our team will review the design and get in touch
      at <strong>${esc(r.customerEmail)}</strong> or <strong>${esc(r.customerPhone)}</strong>
      with a tailored quote. <strong>No payment is needed right now.</strong></p>
      <p>Reference: <strong>${esc(r.requestNumber)}</strong></p>
      <table style="border-collapse:collapse;margin-top:12px">
        ${bespokeConfigLines(r)
          .map(
            (l) =>
              `<tr><td style="padding:4px 0;font-size:14px;color:#333">${esc(l)}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="margin-top:20px;color:#666;font-size:13px">— Too Good For Merch</p>
    </div>`.trim();

  return { subject, html, text };
}

// Internal notification for the TGFM team.
export function buildBespokeOpsMessage(r: BespokeNotifyView): string {
  return [
    `New bespoke request ${r.requestNumber}`,
    `Customer: ${r.customerName} · ${r.customerEmail} · ${r.customerPhone}`,
    ``,
    ...bespokeConfigLines(r),
    ``,
    `Received: ${r.createdAt.toISOString()}`,
  ].join("\n");
}

export function buildBespokeOpsEmail(r: BespokeNotifyView): {
  subject: string;
  html: string;
  text: string;
} {
  const text = buildBespokeOpsMessage(r);
  const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${esc(
    text,
  )}</pre>`;
  return { subject: `New bespoke request ${r.requestNumber}`, html, text };
}
