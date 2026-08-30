// Minimal, zero-dependency WhatsApp notification via the Meta WhatsApp
// Cloud API. Distinct from src/lib/contact.ts's WHATSAPP_URL, which is
// only a wa.me deep link for humans to click. Fully env-gated: with
// WHATSAPP_TOKEN / WHATSAPP_PHONE_ID unset it logs and reports
// { skipped: true }. Never throws.
import type { SendResult } from "src/lib/notify/email";

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_ID?.trim(),
  );
}

export async function sendWhatsAppText(input: {
  to: string;
  body: string;
}): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  const to = input.to.replace(/[^\d]/g, "");

  if (!token || !phoneId) {
    console.info("[notify/whatsapp] WHATSAPP_TOKEN/PHONE_ID not set -- skipping");
    return { sent: false, skipped: true, reason: "WhatsApp Cloud API not configured" };
  }
  if (!to) {
    return { sent: false, error: "No destination phone number" };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: input.body.slice(0, 4000) },
      }),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const error = `WhatsApp API responded ${res.status}: ${raw.slice(0, 300)}`;
      console.error("[notify/whatsapp] send failed", error);
      return { sent: false, error };
    }
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown WhatsApp transport error";
    console.error("[notify/whatsapp] transport error", error);
    return { sent: false, error };
  }
}
