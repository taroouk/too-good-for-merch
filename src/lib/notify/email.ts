// Minimal, zero-dependency outbound email via the Resend HTTP API. This
// repo had no email infrastructure (only mailto: links); this is the
// smallest thing that can actually deliver a message. Fully env-gated:
// with RESEND_API_KEY unset it logs and reports { skipped: true } so the
// caller (a Bespoke request creation) still succeeds. Never throws.

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendResult =
  | { sent: true; skipped?: false; id?: string }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; skipped?: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Too Good For Merch <onboarding@resend.dev>";

  if (!apiKey) {
    console.info("[notify/email] RESEND_API_KEY not set -- skipping email", {
      to: input.to,
      subject: input.subject,
    });
    return { sent: false, skipped: true, reason: "RESEND_API_KEY not configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `Resend responded ${res.status}: ${body.slice(0, 300)}`;
      console.error("[notify/email] send failed", error);
      return { sent: false, error };
    }

    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: data?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown email transport error";
    console.error("[notify/email] transport error", error);
    return { sent: false, error };
  }
}
