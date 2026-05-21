// scripts/seed-admins.mjs
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const ADMINS = [
  { email: "karem@toogoodformerch.com", password: "kareem@merch" },
  { email: "malakelbahtimy@gmail.com", password: "malak@merch" },
  { email: "hello@toogoodformerch.com", password: "hello@merch" },
];

async function main() {
  for (const a of ADMINS) {
    const email = a.email.toLowerCase().trim();
    const passwordHash = await argon2.hash(a.password);

    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: "ADMIN" },
      create: { email, passwordHash, role: "ADMIN" },
    });

    console.log(`✅ ADMIN upserted: ${email}`);
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });