// scripts/seed-admins.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

function parseAdminSeedUsers() {
  const explicit = process.env.ADMIN_SEED_USERS?.trim();
  if (explicit) {
    return explicit.split(",").map((entry) => {
      const separator = entry.indexOf(":");
      if (separator <= 0) throw new Error("ADMIN_SEED_USERS must use email:password entries.");
      return {
        email: entry.slice(0, separator).trim().toLowerCase(),
        password: entry.slice(separator + 1),
      };
    });
  }

  const password = process.env.ADMIN_SEED_PASSWORD;
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (password && emails.length) {
    return emails.map((email) => ({ email, password }));
  }

  throw new Error(
    "Set ADMIN_SEED_USERS=\"admin@example.com:strong-password\" or ADMIN_EMAILS plus ADMIN_SEED_PASSWORD.",
  );
}

function validateAdmin(admin) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
    throw new Error(`Invalid admin email: ${admin.email}`);
  }
  if (!admin.password || admin.password.length < 12 || admin.password.length > 128) {
    throw new Error(`Admin seed password for ${admin.email} must be between 12 and 128 characters.`);
  }
}

async function main() {
  const admins = parseAdminSeedUsers();

  for (const a of admins) {
    validateAdmin(a);
    const email = a.email.toLowerCase().trim();
    const passwordHash = await argon2.hash(a.password, { type: argon2.argon2id });

    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: "ADMIN" },
      create: { email, passwordHash, role: "ADMIN" },
    });

    console.log(`ADMIN upserted: ${email}`);
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
