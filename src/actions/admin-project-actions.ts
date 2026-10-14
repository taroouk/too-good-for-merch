"use server";

import { BuildStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { safeAdminPath } from "src/lib/admin/action-url";
import { prisma } from "src/lib/prisma";

// Archive / restore a customer's Studio project (e.g. abuse, or the
// customer asked support to hide it). Never hard-deletes: orders and
// bespoke requests reference builds, and an order must keep its history.
export async function setProjectArchivedAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(safeAdminPath(formData.get("returnTo"), "/admin/projects"), async () => {
    const id = formString(formData, "id", 100);
    const archive = formString(formData, "archive", 10) === "true";
    const build = await prisma.build.findUnique({ where: { id }, select: { id: true, name: true, status: true, userId: true } });
    if (!build) throw new AdminActionError("Project not found.");
    const next = archive ? BuildStatus.ARCHIVED : BuildStatus.ACTIVE;
    if (build.status === next) throw new AdminActionError(archive ? "Project is already archived." : "Project is already active.");
    await prisma.$transaction([
      prisma.build.update({ where: { id }, data: { status: next } }),
      prisma.adminAuditLog.create({
        data: { adminId: admin.id, action: archive ? "PROJECT_ARCHIVED" : "PROJECT_RESTORED", previousValue: build.status, newValue: next, metadata: { buildId: id, name: build.name, userId: build.userId } as Prisma.InputJsonValue },
      }),
    ]);
    revalidatePath("/admin/projects");
    return archive ? "Project archived." : "Project restored.";
  });
}
