// Pure helpers for the password-reset flow (no DB, no network) so they can
// be unit tested. The routes in app/api/auth/{forgot,reset}-password use
// them together with next-auth's existing VerificationToken table.
import { createHash, randomBytes } from "node:crypto";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// The raw token only ever exists in the emailed link; the database stores
// its SHA-256, so a database leak can't be turned into working reset links.
export function generateResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashResetToken(raw) };
}

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Namespaced so a reset token can never be confused with next-auth's own
// email-sign-in tokens that share the VerificationToken table.
export function resetIdentifier(email: string): string {
  return `pwreset:${email}`;
}

// Same bounds as registration (app/api/auth/register/route.ts).
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < 8 || password.length > 128) return "Password must be between 8 and 128 characters.";
  return null;
}

export function buildResetEmail(link: string): { subject: string; html: string; text: string } {
  const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const subject = "Reset your Too Good For Merch password";
  const text = [
    "We got a request to reset the password for your Too Good For Merch account.",
    "",
    `Set a new password: ${link}`,
    "",
    "This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email — your password won't change.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#0b0b0b">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#777;margin:0">Too Good For Merch</p>
<h1 style="font-size:20px;margin:12px 0 8px">Reset your password</h1>
<p style="line-height:1.5;margin:0 0 20px">We got a request to reset the password for your account. This link works once and expires in 1 hour.</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#0b0b0b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:13px;font-weight:bold">Set a new password</a></p>
<p style="font-size:12px;color:#777;line-height:1.5;margin:0">If you didn't ask for this, ignore this email — your password won't change.</p>
</div></body></html>`;
  return { subject, html, text };
}
