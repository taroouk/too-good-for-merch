// file: src/actions/build-actions.ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess, rememberGuestBuildId } from "src/studio/permissions";
import { normalizeArtworkPlacement } from "src/lib/artwork/save";
import { draftArtworkLayers, normalizeArtworkLayers } from "src/studio/artwork-layers";
import { upsertPlacementsInNotes } from "src/pricing/placements";
import { BuildStatus, Prisma } from "@prisma/client";

const PRODUCT = ["FITTED", "OVERSIZED", "CUSTOM"] as const;
const COLOR = ["BLACK", "WHITE", "CUSTOM"] as const;
const FABRIC = ["ESSENTIALS_170", "SIGNATURE_200", "HEAVYWEIGHT_300"] as const;

function asEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] | null {
  if (typeof value !== "string") return null;
  return (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

export async function actionCreateBuild(formData: FormData) {
  const userId = await getUserId();

  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const safeName = name.length ? name.slice(0, 120) : "Untitled";

  const build = await prisma.build.create({
    data: {
      userId: userId ?? null,
      name: safeName,
      status: BuildStatus.ACTIVE,
      draft: {
        create: {
          product: null,
          color: null,
          fabric: null,
          quantity: 1,
          customNotes: null,
          primaryAssetId: null,
        },
      },
    },
    select: { id: true },
  });

  if (!userId) {
    await rememberGuestBuildId(build.id);
  }

  redirect(`/studio/projects/${build.id}/builder`);
}

export async function actionRenameBuild(buildId: string, formData: FormData) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const safeName = name.length ? name.slice(0, 120) : "Untitled";

  await prisma.build.update({
    where: { id: buildId },
    data: { name: safeName },
    select: { id: true },
  });

  redirect(`/studio/projects/${buildId}/settings`);
}

export async function actionUpdateDraft(buildId: string, formData: FormData) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const product = asEnum(formData.get("product"), PRODUCT);
  const color = asEnum(formData.get("color"), COLOR);
  const fabric = asEnum(formData.get("fabric"), FABRIC);

  const quantityRaw = formData.get("quantity");
  const quantityParsed =
    typeof quantityRaw === "string" && quantityRaw.trim() ? Number(quantityRaw) : NaN;
  const quantity = Number.isFinite(quantityParsed)
    ? Math.max(1, Math.min(9999, Math.round(quantityParsed)))
    : 1;

  const customNotesRaw = formData.get("customNotes");
  const customNotes =
    typeof customNotesRaw === "string" ? customNotesRaw.slice(0, 2000) : "";

  const primaryAssetIdRaw = formData.get("primaryAssetId");
  const primaryAssetId =
    typeof primaryAssetIdRaw === "string" ? primaryAssetIdRaw : "";

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: {
      draft: {
        select: {
          id: true,
          product: true,
          color: true,
          fabric: true,
          quantity: true,
          customNotes: true,
          primaryAssetId: true,
          customQuoteUsdCents: true,
        },
      },
    },
  });

  if (!build?.draft?.id) throw new Error("Draft not found");

  const draft = build.draft;
  const nextCustomNotes = customNotes.length ? customNotes : null;
  const nextPrimaryAssetId = await validPrimaryAssetId(buildId, primaryAssetId);

  // An admin-set Bespoke/Custom quote (see src/actions/admin-bespoke-actions.ts)
  // is only valid for the exact draft state it was quoted against -- if
  // anything the admin actually priced has changed, drop it so a stale
  // price can never be reused for a materially different request. No-op
  // when there was no active quote to begin with.
  const changed =
    draft.product !== (product ?? null) ||
    draft.color !== (color ?? null) ||
    draft.fabric !== (fabric ?? null) ||
    draft.quantity !== quantity ||
    draft.customNotes !== nextCustomNotes ||
    draft.primaryAssetId !== nextPrimaryAssetId;

  await prisma.buildDraft.update({
    where: { id: draft.id },
    data: {
      product: product ?? null,
      color: color ?? null,
      fabric: fabric ?? null,
      quantity,
      customNotes: nextCustomNotes,
      primaryAssetId: nextPrimaryAssetId,
      ...(changed && draft.customQuoteUsdCents != null
        ? {
            customQuoteUsdCents: null,
            customQuoteNote: null,
            customQuotedAt: null,
            customQuotedByEmail: null,
          }
        : {}),
    },
  });
}

// Persists ONLY the canvas transform to BuildDraft.artworkPlacement.
// Deliberately decoupled from actionSaveArtwork (src/actions/artwork-actions.ts),
// which additionally snapshots the AI-generated mockup bytes into a new
// Artwork row and therefore no-ops until an AI mockup exists. Per the
// schema comment on BuildDraft.artworkPlacement / the Artwork model,
// placement is meant to survive a refresh independently of that image --
// so a user who drags/resizes artwork but hasn't generated an AI mockup
// yet must still have their positioning saved. Safe to call repeatedly;
// same upsert-free single-row update as actionUpdateDraft.
export async function actionSaveArtworkPlacement(buildId: string, placement: unknown) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const normalized = normalizeArtworkPlacement(placement);
  if (!normalized) return;

  const draft = await prisma.buildDraft.findUnique({
    where: { buildId },
    select: { id: true },
  });
  if (!draft) return;

  await prisma.buildDraft.update({
    where: { id: draft.id },
    data: { artworkPlacement: normalized },
  });
}

// Persists a multi-artwork design (src/studio/artwork-layers.ts): the full
// layer list, plus the legacy single-artwork mirrors (primaryAssetId +
// artworkPlacement = the first layer) and the priced placements in
// customNotes = every layer's placement. Only assets on this build are
// accepted (picking an upload from another project copies it here first --
// actionAttachExistingAsset). Like actionUpdateDraft, a change to the
// placements or primary artwork voids an admin Bespoke quote.
export async function actionSaveArtworkLayers(buildId: string, layersInput: unknown, forProduct?: string | null) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  // Each product keeps its own design (actionSwitchProduct). A save that was
  // still in flight when the customer switched product describes the OLD
  // product's design -- never let it overwrite the new one.
  if (forProduct) {
    const current = await prisma.buildDraft.findUnique({ where: { buildId }, select: { product: true } });
    if (current && current.product !== forProduct) return { ok: false as const, layers: [] };
  }

  const requested = normalizeArtworkLayers(layersInput);
  const owned = requested.length
    ? await prisma.asset.findMany({
        where: { id: { in: requested.map((layer) => layer.assetId) }, buildId, hiddenAt: null },
        select: { id: true },
      })
    : [];
  const ownedIds = new Set(owned.map((asset) => asset.id));
  const layers = requested
    .filter((layer) => ownedIds.has(layer.assetId))
    .map((layer) => {
      const bounded = normalizeArtworkPlacement(layer);
      return bounded
        ? { ...layer, x: bounded.x, y: bounded.y, scale: bounded.scale, rotation: bounded.rotation }
        : layer;
    });

  const draft = await prisma.buildDraft.findUnique({
    where: { buildId },
    select: { id: true, customNotes: true, primaryAssetId: true, customQuoteUsdCents: true },
  });
  if (!draft) throw new Error("Draft not found");

  const first = layers[0] ?? null;
  const nextCustomNotes = layers.length
    ? upsertPlacementsInNotes(draft.customNotes, layers.map((layer) => layer.placement))
    : draft.customNotes;
  const nextPrimaryAssetId = first?.assetId ?? null;
  const changed = draft.customNotes !== nextCustomNotes || draft.primaryAssetId !== nextPrimaryAssetId;

  await prisma.buildDraft.update({
    where: { id: draft.id },
    data: {
      artworkLayers: layers.length ? layers : Prisma.DbNull,
      primaryAssetId: nextPrimaryAssetId,
      artworkPlacement: first
        ? { placement: first.placement, x: first.x, y: first.y, scale: first.scale, rotation: first.rotation }
        : Prisma.DbNull,
      customNotes: nextCustomNotes,
      ...(changed && draft.customQuoteUsdCents != null
        ? { customQuoteUsdCents: null, customQuoteNote: null, customQuotedAt: null, customQuotedByEmail: null }
        : {}),
    },
  });

  return { ok: true as const, layers };
}

// One product type's design, as stored in BuildDraft.productDesigns while
// another product is the current one.
type StoredProductDesign = {
  layers: ReturnType<typeof normalizeArtworkLayers>;
  printMockupId: string | null;
  printMockupFingerprint: string | null;
  aiMockupId: string | null;
  aiMockupFingerprint: string | null;
  backPrintMockupId: string | null;
  backPrintMockupFingerprint: string | null;
  backAiMockupId: string | null;
  backAiMockupFingerprint: string | null;
};

function storedDesign(value: unknown): StoredProductDesign | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (key: string) => (typeof v[key] === "string" ? (v[key] as string) : null);
  return {
    layers: normalizeArtworkLayers(v.layers),
    printMockupId: str("printMockupId"),
    printMockupFingerprint: str("printMockupFingerprint"),
    aiMockupId: str("aiMockupId"),
    aiMockupFingerprint: str("aiMockupFingerprint"),
    backPrintMockupId: str("backPrintMockupId"),
    backPrintMockupFingerprint: str("backPrintMockupFingerprint"),
    backAiMockupId: str("backAiMockupId"),
    backAiMockupFingerprint: str("backAiMockupFingerprint"),
  };
}

// Switches the build to another product type (FITTED / OVERSIZED / CUSTOM)
// while keeping every product's design separate: the current product's
// design (artworks + its front/back print and AI mockups) is parked in
// productDesigns, and the target product's own design -- or an empty one the
// first time -- becomes the current design. Mockups therefore only ever show
// on the model of the product they were generated for. `currentLayers` is
// the client's live design (its last edit may not have been saved yet).
export async function actionSwitchProduct(
  buildId: string,
  input: { product: unknown; fabric?: unknown; currentLayers?: unknown },
) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const nextProduct = asEnum(input.product, PRODUCT);
  if (!nextProduct) throw new Error("Invalid product.");
  const nextFabric = asEnum(input.fabric, FABRIC);

  const draft = await prisma.buildDraft.findUnique({
    where: { buildId },
    select: {
      id: true,
      product: true,
      fabric: true,
      customNotes: true,
      artworkLayers: true,
      primaryAssetId: true,
      artworkPlacement: true,
      printMockupId: true,
      printMockupFingerprint: true,
      aiMockupId: true,
      aiMockupFingerprint: true,
      backPrintMockupId: true,
      backPrintMockupFingerprint: true,
      backAiMockupId: true,
      backAiMockupFingerprint: true,
      productDesigns: true,
    },
  });
  if (!draft) throw new Error("Draft not found");

  const designs =
    draft.productDesigns && typeof draft.productDesigns === "object"
      ? { ...(draft.productDesigns as Record<string, unknown>) }
      : {};

  // Park the current product's design (the client's live layers win over the
  // stored ones, limited to assets that really belong to this build).
  if (draft.product && draft.product !== nextProduct) {
    let currentLayers = draftArtworkLayers(draft);
    if (input.currentLayers !== undefined) {
      const requested = normalizeArtworkLayers(input.currentLayers);
      const owned = requested.length
        ? await prisma.asset.findMany({
            where: { id: { in: requested.map((l) => l.assetId) }, buildId },
            select: { id: true },
          })
        : [];
      const ownedIds = new Set(owned.map((a) => a.id));
      currentLayers = requested.filter((l) => ownedIds.has(l.assetId));
    }
    designs[draft.product] = {
      layers: currentLayers,
      printMockupId: draft.printMockupId,
      printMockupFingerprint: draft.printMockupFingerprint,
      aiMockupId: draft.aiMockupId,
      aiMockupFingerprint: draft.aiMockupFingerprint,
      backPrintMockupId: draft.backPrintMockupId,
      backPrintMockupFingerprint: draft.backPrintMockupFingerprint,
      backAiMockupId: draft.backAiMockupId,
      backAiMockupFingerprint: draft.backAiMockupFingerprint,
    } satisfies StoredProductDesign;
  }

  const target =
    draft.product === nextProduct
      ? null
      : storedDesign(designs[nextProduct]) ?? {
          layers: [],
          printMockupId: null,
          printMockupFingerprint: null,
          aiMockupId: null,
          aiMockupFingerprint: null,
          backPrintMockupId: null,
          backPrintMockupFingerprint: null,
          backAiMockupId: null,
          backAiMockupFingerprint: null,
        };
  if (target) delete designs[nextProduct];

  // Only keep target layers whose assets still exist (and aren't removed).
  let targetLayers = target?.layers ?? draftArtworkLayers(draft);
  if (target && targetLayers.length) {
    const alive = await prisma.asset.findMany({
      where: { id: { in: targetLayers.map((l) => l.assetId) }, buildId, hiddenAt: null },
      select: { id: true },
    });
    const aliveIds = new Set(alive.map((a) => a.id));
    targetLayers = targetLayers.filter((l) => aliveIds.has(l.assetId));
  }
  const first = targetLayers[0] ?? null;

  const updated = await prisma.buildDraft.update({
    where: { id: draft.id },
    data: {
      product: nextProduct,
      ...(nextFabric ? { fabric: nextFabric } : {}),
      productDesigns: Object.keys(designs).length ? (designs as Prisma.InputJsonValue) : Prisma.DbNull,
      ...(target
        ? {
            artworkLayers: targetLayers.length ? targetLayers : Prisma.DbNull,
            primaryAssetId: first?.assetId ?? null,
            artworkPlacement: first
              ? { placement: first.placement, x: first.x, y: first.y, scale: first.scale, rotation: first.rotation }
              : Prisma.DbNull,
            customNotes: upsertPlacementsInNotes(draft.customNotes, targetLayers.map((l) => l.placement)),
            printMockupId: target.printMockupId,
            printMockupFingerprint: target.printMockupFingerprint,
            aiMockupId: target.aiMockupId,
            aiMockupFingerprint: target.aiMockupFingerprint,
            backPrintMockupId: target.backPrintMockupId,
            backPrintMockupFingerprint: target.backPrintMockupFingerprint,
            backAiMockupId: target.backAiMockupId,
            backAiMockupFingerprint: target.backAiMockupFingerprint,
          }
        : {}),
      // A product change always voids an admin Bespoke quote (as actionUpdateDraft does).
      ...(draft.product !== nextProduct
        ? { customQuoteUsdCents: null, customQuoteNote: null, customQuotedAt: null, customQuotedByEmail: null }
        : {}),
    },
    select: {
      product: true,
      fabric: true,
      customNotes: true,
      primaryAssetId: true,
      printMockupId: true,
      printMockupFingerprint: true,
      aiMockupId: true,
      aiMockupFingerprint: true,
      backPrintMockupId: true,
      backPrintMockupFingerprint: true,
      backAiMockupId: true,
      backAiMockupFingerprint: true,
    },
  });

  const assets = targetLayers.length
    ? await prisma.asset.findMany({
        where: { id: { in: targetLayers.map((l) => l.assetId) }, buildId },
        select: { id: true, url: true, fileName: true, artworkSha256: true },
      })
    : [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const fileUrl = (id: string | null) => (id ? `/api/mockups/${id}/file` : null);

  return {
    product: updated.product,
    fabric: updated.fabric,
    customNotes: updated.customNotes,
    primaryAssetId: updated.primaryAssetId,
    layers: targetLayers.flatMap((layer) => {
      const asset = byId.get(layer.assetId);
      return asset?.url ? [{ ...layer, url: asset.url, fileName: asset.fileName, hash: asset.artworkSha256 }] : [];
    }),
    mockups: {
      front: {
        printUrl: fileUrl(updated.printMockupId),
        printFp: updated.printMockupFingerprint,
        aiUrl: fileUrl(updated.aiMockupId),
        aiFp: updated.aiMockupFingerprint,
      },
      back: {
        printUrl: fileUrl(updated.backPrintMockupId),
        printFp: updated.backPrintMockupFingerprint,
        aiUrl: fileUrl(updated.backAiMockupId),
        aiFp: updated.backAiMockupFingerprint,
      },
    },
  };
}

async function validPrimaryAssetId(buildId: string, assetId: string) {
  if (!assetId.length) return null;

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, buildId },
    select: { id: true },
  });

  return asset?.id ?? null;
}
