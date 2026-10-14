"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { evaluateRoleChange } from "src/lib/admin/team";
import { prisma } from "src/lib/prisma";

const RETURN_TO = "/admin/team";

async function changeRole(actorId: string, targetId: string, nextRole: "ADMIN" | "USER") {
  // Serializable so two admins demoting each other at the same moment can't
  // both pass the "at least one other active admin" check.
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, email: true, role: true, blockedAt: true } });
      if (!target) throw new AdminActionError("Account not found.");
      const otherActiveAdmins = await tx.user.count({ where: { role: "ADMIN", blockedAt: null, id: { not: targetId } } });
      const problem = evaluateRoleChange({
        actorId,
        targetId,
        targetRole: target.role,
        targetBlocked: Boolean(target.blockedAt),
        nextRole,
        otherActiveAdmins,
      });
      if (problem) throw new AdminActionError(problem);
      await tx.user.update({ where: { id: targetId }, data: { role: nextRole } });
      await tx.adminAuditLog.create({
        data: {
          adminId: actorId,
          action: nextRole === "ADMIN" ? "ADMIN_PROMOTED" : "ADMIN_DEMOTED",
          previousValue: target.role,
          newValue: nextRole,
          metadata: { userId: targetId, email: target.email } as Prisma.InputJsonValue,
        },
      });
      return target.email ?? "Account";
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function promoteToAdminByEmailAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const email = formString(formData, "email", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminActionError("Enter a valid email address.");
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new AdminActionError("No account exists with that email. They need to register first.");
    const label = await changeRole(admin.id, user.id, "ADMIN");
    revalidatePath(RETURN_TO);
    revalidatePath("/admin/users");
    return `${label} is now an admin.`;
  });
}

export async function demoteAdminAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const userId = formString(formData, "userId", 100);
    if (!userId) throw new AdminActionError("Missing account.");
    const label = await changeRole(admin.id, userId, "USER");
    revalidatePath(RETURN_TO);
    revalidatePath("/admin/users");
    return `${label} is no longer an admin.`;
  });
}
