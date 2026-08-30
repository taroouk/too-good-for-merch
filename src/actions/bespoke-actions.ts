// file: src/actions/bespoke-actions.ts
"use server";

import type { FabricType, GarmentColor, ProductType } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { requireUserId } from "src/studio/authz";
import { canAccessBuild } from "src/studio/permissions";
import { validateCustomer, CustomerValidationError } from "src/lib/orders/customer";
import { assertBespokeOnly } from "src/lib/bespoke/eligibility";
import { buildRequestSnapshot, generateRequestNumber } from "src/lib/bespoke/snapshot";
import { resolveArtworkIdForBuild } from "src/lib/artwork/persist";
import { notifyBespokeRequestCreated } from "src/lib/notify/bespoke";

export type CreateBespokeInput = {
  buildId: string;
  customer: { name: string; email: string; phone: string };
  size?: string;
  placements?: unknown;
};

export type CreateBespokeResult =
  | { ok: true; id: string; requestNumber: string }
  | { ok: false; error: string };

// Builder -> BESPOKE -> Checkout -> HERE. Creates a no-payment
// BespokeRequest with a full, immutable snapshot of the Builder state and
// a stable Artwork reference, then fires (best-effort) email + WhatsApp
// notifications. Never touches Paymob.
export async function actionCreateBespokeRequest(
  input: CreateBespokeInput,
): Promise<CreateBespokeResult> {
  const buildId =
    typeof input?.buildId === "string" ? input.buildId.trim().slice(0, 128) : "";
  const userId = await requireUserId(
    `/bespoke/new${buildId ? `?buildId=${encodeURIComponent(buildId)}` : ""}`,
  );
  if (!buildId) return { ok: false, error: "A build is required." };

  let contact;
  try {
    contact = validateCustomer(input.customer);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof CustomerValidationError
          ? error.message
          : "Enter valid contact details.",
    };
  }

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: {
      id: true,
      userId: true,
      draft: {
        select: {
          product: true,
          color: true,
          fabric: true,
          quantity: true,
          customNotes: true,
          artworkPlacement: true,
          savedArtworkId: true,
          aiMockupId: true,
        },
      },
    },
  });
  if (!build?.draft) return { ok: false, error: "Build not found." };
  if (!(await canAccessBuild(userId, build))) {
    return { ok: false, error: "You cannot submit this build." };
  }

  try {
    assertBespokeOnly(build.draft.product);
  } catch {
    return {
      ok: false,
      error: "Only bespoke (custom) builds are submitted as a request. Standard products check out normally.",
    };
  }

  // Claim a guest build for this user, mirroring createCheckoutOrder.
  if (!build.userId) {
    await prisma.build.update({ where: { id: buildId }, data: { userId } });
  }

  const artworkId = await resolveArtworkIdForBuild(
    buildId,
    userId,
    build.draft.artworkPlacement,
  );

  const snapshot = buildRequestSnapshot({
    draft: build.draft,
    contact,
    size: input.size,
    artworkId,
    requestedPlacements: input.placements,
  });

  const request = await prisma.bespokeRequest.create({
    data: {
      requestNumber: generateRequestNumber(),
      userId,
      buildId,
      artworkId,
      product: (snapshot.product as ProductType | null) ?? null,
      color: (snapshot.color as GarmentColor | null) ?? null,
      fabric: (snapshot.fabric as FabricType | null) ?? null,
      quantity: snapshot.quantity,
      size: snapshot.size,
      placements: snapshot.placements,
      transform: snapshot.transform ?? undefined,
      customNotes: snapshot.customNotes,
      customerName: snapshot.customerName,
      customerEmail: snapshot.customerEmail,
      customerPhone: snapshot.customerPhone,
    },
    select: {
      id: true,
      requestNumber: true,
      createdAt: true,
      product: true,
      color: true,
      fabric: true,
      quantity: true,
      size: true,
      placements: true,
      customNotes: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
    },
  });

  // Notifications are fired only AFTER the row is committed and are fully
  // best-effort: any failure is recorded on the row, never surfaced as a
  // request failure.
  try {
    const placements = Array.isArray(request.placements)
      ? request.placements.filter((p): p is string => typeof p === "string")
      : [];
    const outcome = await notifyBespokeRequestCreated({
      requestNumber: request.requestNumber,
      customerName: request.customerName,
      customerEmail: request.customerEmail,
      customerPhone: request.customerPhone,
      product: request.product,
      color: request.color,
      fabric: request.fabric,
      quantity: request.quantity,
      size: request.size,
      placements,
      customNotes: request.customNotes,
      createdAt: request.createdAt,
    });
    await prisma.bespokeRequest.update({
      where: { id: request.id },
      data: {
        emailNotifiedAt: outcome.emailSent ? new Date() : null,
        whatsappNotifiedAt: outcome.whatsappSent ? new Date() : null,
        notifyError: outcome.errors.length
          ? outcome.errors.join("; ").slice(0, 1000)
          : null,
      },
    });
  } catch (err) {
    console.error("BESPOKE_NOTIFY_ERROR", err);
    await prisma.bespokeRequest
      .update({
        where: { id: request.id },
        data: {
          notifyError: (err instanceof Error ? err.message : "notification failed").slice(
            0,
            1000,
          ),
        },
      })
      .catch(() => undefined);
  }

  return { ok: true, id: request.id, requestNumber: request.requestNumber };
}
