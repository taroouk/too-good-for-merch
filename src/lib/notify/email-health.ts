// Is outbound email set up so it can actually reach customers? Pure (takes the
// env values) so it is unit tested; used by System health and by the
// password-reset route to avoid promising an email that can't be sent.

export type EmailSetup = {
  level: "ok" | "warn" | "fail";
  configured: boolean;
  sandboxSender: boolean;
  detail: string;
};

export function emailSetup(env: { apiKey?: string | null; from?: string | null }): EmailSetup {
  const apiKey = env.apiKey?.trim();
  const from = env.from?.trim();
  if (!apiKey) {
    return {
      level: "fail",
      configured: false,
      sandboxSender: false,
      detail: "RESEND_API_KEY is not set — password-reset, order confirmation and shipping emails are NOT being sent.",
    };
  }
  const sandbox = !from || /onboarding@resend\.dev/i.test(from);
  if (sandbox) {
    return {
      level: "warn",
      configured: true,
      sandboxSender: true,
      detail: "EMAIL_FROM is not set to your own domain — Resend's test sender only delivers to the Resend account owner, so customers won't receive emails.",
    };
  }
  return { level: "ok", configured: true, sandboxSender: false, detail: `Sending from ${from}.` };
}
