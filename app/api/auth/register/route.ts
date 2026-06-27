export const runtime = "nodejs";
import { prisma } from "../../../../src/lib/prisma";
import argon2 from "argon2";
import { NextResponse } from "next/server";
import { apiError, readJsonObject } from "src/lib/api/responses";
import { rateLimit, rateLimitHeaders } from "src/lib/rate-limit";

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const limit = rateLimit(req, "auth:register", 5, 10 * 60 * 1000);
    if (!limit.ok) {
      return apiError(
        "Too many registration attempts. Please try again later.",
        429,
        rateLimitHeaders(limit),
      );
    }

    const body = await readJsonObject(req);
    if (!body) return apiError("Invalid JSON request.", 400);

    const emailRaw = (body?.email ?? "").toString();
    const passwordRaw = (body?.password ?? "").toString();

    const email = emailRaw.toLowerCase().trim();
    const password = passwordRaw;

    // Validation (production baseline)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return apiError("Invalid email.", 400);
    }
    if (password.length < 8 || password.length > 128) {
      return apiError("Password must be between 8 and 128 characters.", 400);
    }

    // Prevent duplicates
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError("Email already in use.", 409);
    }

    // Role bootstrap
    const admins = parseAdminEmails();
    const isAdmin = admins.includes(email);
    const role = isAdmin ? "ADMIN" : "USER";

    // Hash password (argon2id)
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err: unknown) {
    console.error("REGISTER_ERROR:", err);
    return apiError("Server error.", 500);
  }
}
