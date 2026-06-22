import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "src/auth";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== Role.ADMIN) redirect("/login?callbackUrl=/admin");
  return session.user;
}
