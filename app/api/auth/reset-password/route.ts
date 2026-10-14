import { NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "src/lib/prisma";
import { apiError, readJsonObject } from "src/lib/api/responses";
import { rateLimitHeaders } from "src/lib/rate-limit";
import { rateLimit } from "src/lib/rate-limit-db";
import { hashResetToken, normalizeEmail, passwordProblem, resetIdentifier } from "src/lib/auth/password-reset";

export const runtime = "nodejs";

const INVALID = "This reset link is invalid or has expired. Request a new one.";

export async function POST(req: Request) {
  const limit = await rateLimit(req, "auth:reset", 10, 15 * 60 * 1000);
  if (!limit.ok) return apiError("Too many attempts. Please try again later.", 429, rateLimitHeaders(limit));

  const body = await readJsonObject(req);
  if (!body) return apiError("Invalid JSON request.", 400);
  const email = normalizeEmail(body.email);
  const token = typeof body.token === "string" ? body.token : "";
  if (!email || !token || token.length > 200) return apiError(INVALID, 400);
  const problem = passwordProblem(body.password);
  if (problem) return apiError(problem, 400);

  const identifier = resetIdentifier(email);
  const tokenHash = hashResetToken(token);
  const passwordHash = await argon2.hash(body.password as string, { type: argon2.argon2id });

  try {
    const changed = await prisma.$transaction(async (tx) => {
      // Single use: deleting the row is the claim. Only the request that
      // actually deletes a still-valid token may change the password, so
      // two simultaneous submissions can't both succeed.
      const claimed = await tx.verificationToken.deleteMany({ where: { identifier, token: tokenHash, expires: { gt: new Date() } } });
      if (claimed.count === 0) return false;
      const updated = await tx.user.updateMany({ where: { email, blockedAt: null }, data: { passwordHash } });
      if (updated.count === 0) return false;
      // Any other outstanding links for this account die with it.
      await tx.verificationToken.deleteMany({ where: { identifier } });
      return true;
    });
    if (!changed) return apiError(INVALID, 400);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reset-password] error", error);
    return apiError("Server error.", 500);
  }
}
