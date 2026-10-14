"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { isLegalSlug, legalPageProblem } from "src/lib/legal-format";
import { prisma } from "src/lib/prisma";

const RETURN_TO = "/admin/legal";

export async function saveLegalPageAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const slug = formString(formData, "slug", 20);
    if (!isLegalSlug(slug)) throw new AdminActionError("Unknown page.");
    // formString trims and caps length; the body is read raw so internal
    // blank lines/indentation survive.
    const title = formString(formData, "title", 120);
    const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
    const problem = legalPageProblem({ title, body });
    if (problem) throw new AdminActionError(problem);

    const previous = await prisma.legalPage.findUnique({ where: { slug }, select: { body: true } });
    await prisma.$transaction([
      prisma.legalPage.upsert({
        where: { slug },
        update: { title, body, updatedByEmail: admin.email ?? null },
        create: { slug, title, body, updatedByEmail: admin.email ?? null },
      }),
      prisma.adminAuditLog.create({
        data: { adminId: admin.id, action: "LEGAL_PAGE_SAVED", metadata: { slug, previousLength: previous?.body.length ?? null, newLength: body.length } as Prisma.InputJsonValue },
      }),
    ]);
    revalidatePath(RETURN_TO);
    revalidatePath(`/legal/${slug}`);
    return "Page saved and live.";
  });
}

// Drops the admin's edits so the built-in draft shows again.
export async function resetLegalPageAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const slug = formString(formData, "slug", 20);
    if (!isLegalSlug(slug)) throw new AdminActionError("Unknown page.");
    await prisma.$transaction([
      prisma.legalPage.deleteMany({ where: { slug } }),
      prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "LEGAL_PAGE_RESET", metadata: { slug } as Prisma.InputJsonValue } }),
    ]);
    revalidatePath(RETURN_TO);
    revalidatePath(`/legal/${slug}`);
    return "Reverted to the built-in draft.";
  });
}
