import { Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { draftArtworkLayers } from "src/studio/artwork-layers";
import { placementsFromCustomNotes, normalizePlacements, type PlacementKey } from "src/pricing/placements";

// Self-heal for a design that lost its artwork reference but still has the
// mockups it produced (e.g. a product switch that parked an empty layer list).
// The mockups remember which upload they were made from, so put that upload
// back on the placement recorded in the draft's notes. Position/size were not
// kept, so it comes back at the placement's default spot. No-op when the draft
// has artwork, has no mockup, or the upload is gone. Returns true if it fixed it.
export async function recoverDraftArtworkIfLost(buildId: string): Promise<boolean> {
  const draft = await prisma.buildDraft.findUnique({
    where: { buildId },
    select: {
      id: true,
      product: true,
      customNotes: true,
      primaryAssetId: true,
      artworkLayers: true,
      artworkPlacement: true,
      printMockup: { select: { assetId: true, placement: true } },
      aiMockup: { select: { assetId: true, placement: true } },
    },
  });
  if (!draft || draft.product === "CUSTOM") return false;
  if (draft.primaryAssetId || draftArtworkLayers(draft).length) return false;

  const mockup = draft.printMockup?.assetId ? draft.printMockup : draft.aiMockup?.assetId ? draft.aiMockup : null;
  if (!mockup?.assetId) return false;

  const asset = await prisma.asset.findFirst({
    where: { id: mockup.assetId, buildId, hiddenAt: null, url: { not: null } },
    select: { id: true },
  });
  if (!asset) return false;

  const placement: PlacementKey =
    placementsFromCustomNotes(draft.customNotes)[0] ?? normalizePlacements(mockup.placement)[0] ?? "CENTER_FRONT";
  const layer = { placement, assetId: asset.id, x: 0, y: 0, scale: 1, rotation: 0 };

  await prisma.buildDraft.update({
    where: { id: draft.id },
    data: {
      artworkLayers: [layer] as unknown as Prisma.InputJsonValue,
      primaryAssetId: asset.id,
      artworkPlacement: { placement, x: 0, y: 0, scale: 1, rotation: 0 },
    },
  });
  return true;
}
