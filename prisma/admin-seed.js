import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const admins = parseAdminEmails();

  if (admins.length === 0) {
    console.log("No ADMIN_EMAILS found. Skipping.");
    return;
  }

  const result = await prisma.user.updateMany({
    where: { email: { in: admins } },
    data: { role: "ADMIN" },
  });

  console.log(`Admin roles synced. Updated: ${result.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });