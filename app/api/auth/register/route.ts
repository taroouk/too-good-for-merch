export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "../../../../src/lib/prisma";
import argon2 from "argon2";

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = (body?.email ?? "").toString();
    const passwordRaw = (body?.password ?? "").toString();

    const email = emailRaw.toLowerCase().trim();
    const password = passwordRaw;

    // Validation (production baseline)
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Prevent duplicates
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
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
        role, // Prisma enum accepts "ADMIN" | "USER"
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err: any) {
    console.error("REGISTER_ERROR:", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}