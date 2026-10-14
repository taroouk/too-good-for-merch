import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { apiError, readJsonObject } from "src/lib/api/responses";
import { rateLimitHeaders } from "src/lib/rate-limit";
import { rateLimit, rateLimitByKey } from "src/lib/rate-limit-db";
import { sendEmail } from "src/lib/notify/email";
import { siteUrl } from "src/lib/site-url";
import { RESET_TOKEN_TTL_MS, buildResetEmail, generateResetToken, normalizeEmail, resetIdentifier } from "src/lib/auth/password-reset";

export const runtime = "nodejs";

// Always answers the same 200 whether or not the email has an account, so
// this endpoint can't be used to find out who is registered. Throttled per
// IP and per address so it can't be used to spam someone's inbox either.
export async function POST(req: Request) {
  const ipLimit = await rateLimit(req, "auth:forgot-ip", 10, 15 * 60 * 1000);
  if (!ipLimit.ok) return apiError("Too many requests. Please try again later.", 429, rateLimitHeaders(ipLimit));

  const body = await readJsonObject(req);
  if (!body) return apiError("Invalid JSON request.", 400);
  const email = normalizeEmail(body.email);
  if (!email) return apiError("Enter a valid email address.", 400);

  const emailLimit = await rateLimitByKey("auth:forgot-email", email, 3, 60 * 60 * 1000);
  const generic = NextResponse.json({ ok: true });
  if (!emailLimit.ok) return generic;

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true, blockedAt: true } });
    // Accounts without a password (none today) or blocked ones get no link.
    if (!user?.passwordHash || user.blockedAt) return generic;

    const { raw, hash } = generateResetToken();
    const identifier = resetIdentifier(email);
    await prisma.$transaction([
      // One live link per account: a new request invalidates older ones.
      prisma.verificationToken.deleteMany({ where: { identifier } }),
      prisma.verificationToken.create({ data: { identifier, token: hash, expires: new Date(Date.now() + RESET_TOKEN_TTL_MS) } }),
    ]);

    const base = siteUrl();
    const link = `${base}/reset-password?token=${encodeURIComponent(raw)}&email=${encodeURIComponent(email)}`;
    const message = buildResetEmail(link);
    const result = await sendEmail({ to: email, subject: message.subject, html: message.html, text: message.text });
    if (!result.sent && process.env.NODE_ENV !== "production") {
      // Dev convenience only: with no email provider configured the link is
      // printed to the server console instead. Never in production.
      console.info("[forgot-password] dev reset link (email not sent):", link);
    }
    if (!result.sent && !result.skipped) console.error("[forgot-password] email failed", result.error);
  } catch (error) {
    console.error("[forgot-password] error", error);
  }
  return generic;
}
