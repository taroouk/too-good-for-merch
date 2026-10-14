"use server";

import { revalidatePath } from "next/cache";
import { BespokeRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { requireAdmin } from "src/lib/admin/auth";
import { requireNoteParent } from "src/lib/admin/notes";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { BESPOKE_STATUS_FLOW } from "src/components/admin/ui/status";

function readQuoteAmount(formData: FormData): number {
  const amount = Number(formString(formData, "amountUsd", 20));
  if (!Number.isFinite(amount) || amount <= 0) throw new AdminActionError("Enter a valid quote amount greater than zero.");
  if (amount > 1_000_000) throw new AdminActionError("Quote amount looks too large — check the number.");
  return amount;
}

// Sets (or replaces) the admin quote for a Bespoke/Custom build -- the only
// path a product===CUSTOM build ever gets a real, checkout-eligible price
// (see src/pricing/engine.ts's customQuotePriceResult and its call sites).
// A quoted amount is a TOTAL for the build's current draft state, not a
// per-unit rate -- see customQuotePriceResult for why. Any subsequent draft
// edit (product/color/fabric/quantity/customNotes/primaryAssetId) clears
// this via src/actions/build-actions.ts's actionUpdateDraft, so re-quoting
// here always reflects the build exactly as it stands right now.
export async function setCustomQuoteAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction("/admin/bespoke", async () => {
    const buildId = formString(formData, "buildId", 100);
    const note = formString(formData, "note", 2000);
    const amount = readQuoteAmount(formData);
    if (!buildId) throw new AdminActionError("A build is required.");

    const draft = await prisma.buildDraft.findUnique({ where: { buildId }, select: { id: true, product: true } });
    if (!draft) throw new AdminActionError("Build not found.");
    if (draft.product !== "CUSTOM") throw new AdminActionError("This build is not a Bespoke/Custom request.");

    const quoteUsdCents = Math.round(amount * 100);
    await prisma.$transaction([
      prisma.buildDraft.update({
        where: { id: draft.id },
        data: {
          customQuoteUsdCents: quoteUsdCents,
          customQuoteNote: note || null,
          customQuotedAt: new Date(),
          customQuotedByEmail: admin.email ?? null,
        },
      }),
      prisma.adminAuditLog.create({
        data: { adminId: admin.id, action: "BUILD_QUOTE_SET", newValue: String(quoteUsdCents), metadata: { buildId } as Prisma.InputJsonValue },
      }),
    ]);
    revalidatePath("/admin/bespoke");
    return "Quote saved.";
  });
}

// Revokes a previously-set quote (e.g. it was entered in error) without
// requiring the customer to change anything on their draft first.
export async function clearCustomQuoteAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction("/admin/bespoke", async () => {
    const buildId = formString(formData, "buildId", 100);
    if (!buildId) throw new AdminActionError("A build is required.");
    const draft = await prisma.buildDraft.findUnique({ where: { buildId }, select: { id: true, customQuoteUsdCents: true } });
    if (!draft) throw new AdminActionError("Build not found.");

    await prisma.$transaction([
      prisma.buildDraft.update({
        where: { id: draft.id },
        data: { customQuoteUsdCents: null, customQuoteNote: null, customQuotedAt: null, customQuotedByEmail: null },
      }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "BUILD_QUOTE_CLEARED",
          previousValue: draft.customQuoteUsdCents != null ? String(draft.customQuoteUsdCents) : null,
          metadata: { buildId } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidatePath("/admin/bespoke");
    return "Quote cleared.";
  });
}

// ---------------------------------------------------------------------------
// BespokeRequest (the no-payment intake) -- distinct from the BuildDraft
// quote helpers above, which drive the admin-quoted "pay later" Paymob path.
// ---------------------------------------------------------------------------

function revalidateRequest(id: string) {
  revalidatePath("/admin/bespoke");
  revalidatePath(`/admin/bespoke/${id}`);
}

export async function updateBespokeRequestStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/bespoke/${id}`, async () => {
    const next = formString(formData, "status", 40) as BespokeRequestStatus;
    if (!id || !Object.values(BespokeRequestStatus).includes(next)) throw new AdminActionError("Invalid bespoke request status.");

    const request = await prisma.bespokeRequest.findUnique({ where: { id }, select: { status: true } });
    if (!request) throw new AdminActionError("Bespoke request not found.");
    if (!BESPOKE_STATUS_FLOW[request.status].includes(next)) throw new AdminActionError("This status transition is not allowed.");

    await prisma.$transaction([
      prisma.bespokeRequest.update({ where: { id }, data: { status: next } }),
      prisma.adminAuditLog.create({
        data: { bespokeRequestId: id, adminId: admin.id, action: "BESPOKE_STATUS_CHANGED", previousValue: request.status, newValue: next },
      }),
    ]);
    revalidateRequest(id);
    return `Request moved to ${next}.`;
  });
}

export async function setBespokeRequestQuoteAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/bespoke/${id}`, async () => {
    const amount = readQuoteAmount(formData);
    const note = formString(formData, "note", 2000);
    if (!id) throw new AdminActionError("Bespoke request not found.");

    const request = await prisma.bespokeRequest.findUnique({
      where: { id },
      select: { id: true, status: true, buildId: true, quoteUsdCents: true },
    });
    if (!request) throw new AdminActionError("Bespoke request not found.");

    const quoteUsdCents = Math.round(amount * 100);
    const now = new Date();

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.bespokeRequest.update({
        where: { id },
        data: {
          quoteUsdCents,
          quoteNote: note || null,
          quotedAt: now,
          quotedByEmail: admin.email ?? null,
          // A fresh quote on a NEW/CONTACTED request advances it; leave a
          // later status (ACCEPTED/CLOSED) alone.
          status:
            request.status === BespokeRequestStatus.NEW || request.status === BespokeRequestStatus.CONTACTED
              ? BespokeRequestStatus.QUOTED
              : request.status,
        },
      }),
      prisma.adminAuditLog.create({
        data: {
          bespokeRequestId: id,
          adminId: admin.id,
          action: "BESPOKE_QUOTE_SET",
          previousValue: request.quoteUsdCents != null ? String(request.quoteUsdCents) : null,
          newValue: String(quoteUsdCents),
        },
      }),
    ];

    // Mirror onto the linked BuildDraft so the customer's CUSTOM build
    // unlocks the existing quoted -> Paymob "pay later" checkout path (see
    // src/lib/orders/checkout.ts + src/pricing/engine.ts customQuotePriceResult).
    if (request.buildId) {
      ops.push(
        prisma.buildDraft.updateMany({
          where: { buildId: request.buildId, product: "CUSTOM" },
          data: {
            customQuoteUsdCents: quoteUsdCents,
            customQuoteNote: note || null,
            customQuotedAt: now,
            customQuotedByEmail: admin.email ?? null,
          },
        }),
      );
    }

    await prisma.$transaction(ops);
    revalidateRequest(id);
    return "Quote saved and sent to the customer's build.";
  });
}

export async function addBespokeRequestNoteAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/bespoke/${id}`, async () => {
    const body = formString(formData, "body", 4000);
    if (!id || !body) throw new AdminActionError("Note cannot be empty.");

    try {
      requireNoteParent(await prisma.bespokeRequest.findUnique({ where: { id }, select: { id: true } }), "Bespoke request not found.");
    } catch (error) {
      throw new AdminActionError(error instanceof Error ? error.message : "Bespoke request not found.");
    }

    await prisma.$transaction([
      prisma.bespokeRequestNote.create({ data: { requestId: id, authorId: admin.id, body } }),
      prisma.adminAuditLog.create({ data: { bespokeRequestId: id, adminId: admin.id, action: "BESPOKE_NOTE_ADDED" } }),
    ]);
    revalidateRequest(id);
    return "Internal note added.";
  });
}
