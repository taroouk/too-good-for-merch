// Orchestrates the notifications fired after a BespokeRequest is created.
// Called from src/actions/bespoke-actions.ts AFTER the row is committed,
// inside a try/catch -- a failure here never invalidates the request.
// Returns per-channel outcomes for the action to persist onto the row
// (emailNotifiedAt / whatsappNotifiedAt / notifyError).
import { sendEmail } from "src/lib/notify/email";
import { sendWhatsAppText } from "src/lib/notify/whatsapp";
import {
  buildBespokeCustomerEmail,
  buildBespokeOpsEmail,
  buildBespokeOpsMessage,
  type BespokeNotifyView,
} from "src/lib/notify/bespoke-content";

export type BespokeNotifyOutcome = {
  emailSent: boolean;
  whatsappSent: boolean;
  errors: string[];
};

export async function notifyBespokeRequestCreated(
  view: BespokeNotifyView,
): Promise<BespokeNotifyOutcome> {
  const errors: string[] = [];
  let emailSent = false;
  let whatsappSent = false;

  // 1. Customer confirmation email.
  const customerEmail = buildBespokeCustomerEmail(view);
  const opsInbox = process.env.BESPOKE_NOTIFY_EMAIL?.trim();
  const custResult = await sendEmail({
    to: view.customerEmail,
    subject: customerEmail.subject,
    html: customerEmail.html,
    text: customerEmail.text,
    replyTo: opsInbox,
  });
  if (custResult.sent) emailSent = true;
  else if (!custResult.skipped) errors.push(`customer email: ${custResult.error}`);

  // 2. Ops email (if an inbox is configured).
  if (opsInbox) {
    const opsEmail = buildBespokeOpsEmail(view);
    const opsResult = await sendEmail({
      to: opsInbox,
      subject: opsEmail.subject,
      html: opsEmail.html,
      text: opsEmail.text,
      replyTo: view.customerEmail,
    });
    if (!opsResult.sent && !opsResult.skipped) errors.push(`ops email: ${opsResult.error}`);
  }

  // 3. Ops WhatsApp (if configured).
  const opsPhone = process.env.WHATSAPP_NOTIFY_TO?.trim();
  if (opsPhone) {
    const waResult = await sendWhatsAppText({
      to: opsPhone,
      body: buildBespokeOpsMessage(view),
    });
    if (waResult.sent) whatsappSent = true;
    else if (!waResult.skipped) errors.push(`ops whatsapp: ${waResult.error}`);
  }

  return { emailSent, whatsappSent, errors };
}
