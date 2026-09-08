"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BespokeRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { requireAdmin } from "src/lib/admin/auth";
import { requireNoteParent } from "src/lib/admin/notes";
import { BESPOKE_STATUS_FLOW } from "src/components/admin/ui/status";

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
  const buildId = String(formData.get("buildId") ?? "");
  const amountRaw = String(formData.get("amountUsd") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);

  const amount = Number(amountRaw);
  if (!buildId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid quote amount greater than zero.");
  }

  const draft = await prisma.buildDraft.findUnique({
    where: { buildId },
    select: { id: true, product: true },
  });
  if (!draft) throw new Error("Build not found.");
  if (draft.product !== "CUSTOM") throw new Error("This build is not a Bespoke/Custom request.");

  await prisma.buildDraft.update({
    where: { id: draft.id },
    data: {
      customQuoteUsdCents: Math.round(amount * 100),
      customQuoteNote: note || null,
      customQuotedAt: new Date(),
      customQuotedByEmail: admin.email ?? null,
    },
  });

  revalidatePath("/admin/bespoke");
  redirect(`/admin/bespoke?notice=${encodeURIComponent("Quote saved.")}`);
}

// Revokes a previously-set quote (e.g. it was entered in error) without
// requiring the customer to change anything on their draft first.
export async function clearCustomQuoteAction(formData: FormData) {
  await requireAdmin();
  const buildId = String(formData.get("buildId") ?? "");
  if (!buildId) throw new Error("A build is required.");

  const draft = await prisma.buildDraft.findUnique({
    where: { buildId },
    select: { id: true },
  });
  if (!draft) throw new Error("Build not found.");

  await prisma.buildDraft.update({
    where: { id: draft.id },
    data: {
      customQuoteUsdCents: null,
      customQuoteNote: null,
      customQuotedAt: null,
      customQuotedByEmail: null,
    },
  });

  revalidatePath("/admin/bespoke");
  redirect(`/admin/bespoke?notice=${encodeURIComponent("Quote cleared.")}`);
}

// ---------------------------------------------------------------------------
// BespokeRequest (the no-payment intake) -- distinct from the BuildDraft
// quote helpers above, which drive the admin-quoted "pay later" Paymob path.
// ---------------------------------------------------------------------------

function redirectToRequest(id: string, notice: string): never {
  revalidatePath("/admin/bespoke");
  revalidatePath(`/admin/bespoke/${id}`);
  redirect(`/admin/bespoke/${id}?notice=${encodeURIComponent(notice)}`);
}

export async function updateBespokeRequestStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "") as BespokeRequestStatus;
  if (!id || !Object.values(BespokeRequestStatus).includes(next)) {
    throw new Error("Invalid bespoke request status.");
  }

  const request = await prisma.bespokeRequest.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!request) throw new Error("Bespoke request not found.");
  if (!BESPOKE_STATUS_FLOW[request.status].includes(next)) {
    throw new Error("This status transition is not allowed.");
  }

  await prisma.$transaction([
    prisma.bespokeRequest.update({ where: { id }, data: { status: next } }),
    prisma.adminAuditLog.create({
      data: {
        bespokeRequestId: id,
        adminId: admin.id,
        action: "BESPOKE_STATUS_CHANGED",
        previousValue: request.status,
        newValue: next,
      },
    }),
  ]);

  redirectToRequest(id, `Request moved to ${next}.`);
}

export async function setBespokeRequestQuoteAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const amount = Number(String(formData.get("amountUsd") ?? "").trim());
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (!id || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid quote amount greater than zero.");
  }

  const request = await prisma.bespokeRequest.findUnique({
    where: { id },
    select: { id: true, status: true, buildId: true, quoteUsdCents: true },
  });
  if (!request) throw new Error("Bespoke request not found.");

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
          request.status === BespokeRequestStatus.NEW ||
          request.status === BespokeRequestStatus.CONTACTED
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
  redirectToRequest(id, "Quote saved and sent to the customer's build.");
}

export async function addBespokeRequestNoteAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!id || !body) throw new Error("Note cannot be empty.");

  requireNoteParent(
    await prisma.bespokeRequest.findUnique({ where: { id }, select: { id: true } }),
    "Bespoke request not found.",
  );

  await prisma.$transaction([
    prisma.bespokeRequestNote.create({ data: { requestId: id, authorId: admin.id, body } }),
    prisma.adminAuditLog.create({
      data: { bespokeRequestId: id, adminId: admin.id, action: "BESPOKE_NOTE_ADDED" },
    }),
  ]);

  redirectToRequest(id, "Internal note added.");
}
