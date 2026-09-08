export const runtime = "nodejs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../src/lib/prisma";
import argon2 from "argon2";
import { NextResponse } from "next/server";
import { apiError, readJsonObject } from "src/lib/api/responses";
import { rateLimitHeaders } from "src/lib/rate-limit";
import { rateLimit } from "src/lib/rate-limit-db";
import { parseAdminEmails, resolveBootstrapRole } from "src/lib/auth/bootstrap-role";

type NewUser = { id: string; email: string | null; role: "ADMIN" | "USER"; createdAt: Date };

// Role bootstrap: ADMIN_EMAILS exists so the very first deploy can get an
// admin account without a separate manual step, not as a standing
// allowlist. Once any ADMIN account already exists, public self-
// registration must never be able to mint another one just by matching an
// email in this env var -- otherwise anyone who learns (or guesses) an
// address in ADMIN_EMAILS could permanently self-provision admin access.
// scripts/seed-admins.mjs remains the supported way to add admins after
// initial bootstrap.
//
// The "does an admin already exist" count and the user insert must be
// atomic: under the default (non-transactional) read-then-write, two
// concurrent registrations for two DIFFERENT ADMIN_EMAILS addresses could
// both run the count while neither has committed yet, both see zero
// admins, and both mint themselves ADMIN. Serializable isolation makes
// Postgres abort one of the two transactions with a serialization failure
// instead of letting that write skew through; the retry re-runs the whole
// check inside a fresh transaction, which then sees the other request's
// committed admin row and correctly falls back to USER.
async function createUserWithBootstrapRole(email: string, passwordHash: string): Promise<NewUser> {
  const admins = parseAdminEmails(process.env.ADMIN_EMAILS);
  const matchesAdminAllowlist = admins.includes(email);

  if (!matchesAdminAllowlist) {
    return prisma.user.create({
      data: { email, passwordHash, role: "USER" },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const adminAlreadyExists = (await tx.user.count({ where: { role: "ADMIN" } })) > 0;
          const role = resolveBootstrapRole(matchesAdminAllowlist, adminAlreadyExists);
          return tx.user.create({
            data: { email, passwordHash, role },
            select: { id: true, email: true, role: true, createdAt: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      const isSerializationConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (!isSerializationConflict || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  // Unreachable: the loop above always either returns or throws.
  throw new Error("createUserWithBootstrapRole: exhausted retries without returning or throwing.");
}

export async function POST(req: Request) {
  try {
    const limit = await rateLimit(req, "auth:register", 5, 10 * 60 * 1000);
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

    // Hash password (argon2id)
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await createUserWithBootstrapRole(email, passwordHash);

    return NextResponse.json({ user }, { status: 201 });
  } catch (err: unknown) {
    console.error("REGISTER_ERROR:", err);
    return apiError("Server error.", 500);
  }
}
