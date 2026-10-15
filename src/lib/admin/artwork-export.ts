import { prisma } from "src/lib/prisma";
import { draftArtworkLayers } from "src/studio/artwork-layers";
import { placementLabel } from "src/pricing/placements";
import { extensionForMime } from "src/lib/image/compress-mockup";
import type { ZipEntry } from "src/lib/zip";

export type PaidArtworkRow = { artworkId: string; orderId: string; orderNumber: string };

// Artworks whose customer checked out AND paid: the artwork saved on the
// order's build, or the one frozen onto an order line at checkout.
export async function paidArtworkRows(): Promise<PaidArtworkRow[]> {
  return prisma.$queryRaw<PaidArtworkRow[]>`
    SELECT DISTINCT ON (a.id) a.id AS "artworkId", o.id AS "orderId", o."orderNumber" AS "orderNumber"
    FROM "Artwork" a
    JOIN "Order" o ON o."paymentStatus" = 'PAID'
      AND (
        (o."buildId" IS NOT NULL AND o."buildId" = a."buildId")
        OR EXISTS (
          SELECT 1 FROM "OrderItem" i
          WHERE i."orderId" = o.id AND i.preview ->> 'savedArtworkId' = a.id
        )
      )
    ORDER BY a.id, o."paidAt" DESC NULLS LAST, o."createdAt" DESC`;
}

const slug = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";

// Every file for the given artworks, in a folder each: the mockup image plus
// the original uploads placed on it (and the uncropped originals of cropped
// uploads). Stops adding artworks once `maxBytes` is reached so one request
// can't exhaust memory; `skipped` says how many were left out.
export async function buildArtworkZipEntries(
  artworkIds: string[],
  options: { orderNumbers?: Map<string, string>; maxBytes?: number } = {},
): Promise<{ entries: ZipEntry[]; included: number; skipped: number }> {
  const maxBytes = options.maxBytes ?? 150 * 1024 * 1024;
  const entries: ZipEntry[] = [];
  const usedFolders = new Set<string>();
  let total = 0;
  let included = 0;

  for (let index = 0; index < artworkIds.length; index += 1) {
    if (total >= maxBytes) break;
    const id = artworkIds[index];
    const artwork = await prisma.artwork.findUnique({
      where: { id },
      select: {
        id: true,
        mimeType: true,
        data: true,
        createdAt: true,
        build: { select: { draft: { select: { artworkLayers: true, primaryAssetId: true, artworkPlacement: true } } } },
      },
    });
    if (!artwork) continue;

    const order = options.orderNumbers?.get(id);
    let folder = order ? `order-${slug(order)}` : `artwork-${id.slice(-8)}`;
    if (usedFolders.has(folder)) folder = `${folder}-${id.slice(-6)}`;
    usedFolders.add(folder);

    const files: ZipEntry[] = [];
    if (artwork.data?.byteLength) {
      files.push({ name: `${folder}/mockup.${extensionForMime(artwork.mimeType)}`, data: Buffer.from(artwork.data), date: artwork.createdAt });
    }

    const layers = artwork.build?.draft ? draftArtworkLayers(artwork.build.draft) : [];
    const seen = new Set<string>();
    for (const layer of layers) {
      const asset = await prisma.asset.findUnique({
        where: { id: layer.assetId },
        select: { id: true, fileName: true, artworkData: true, cropSourceAssetId: true },
      });
      if (!asset) continue;
      const label = slug(placementLabel(layer.placement));
      const sources = [{ asset, suffix: asset.cropSourceAssetId ? "cropped" : "original" }];
      if (asset.cropSourceAssetId) {
        const original = await prisma.asset.findUnique({
          where: { id: asset.cropSourceAssetId },
          select: { id: true, fileName: true, artworkData: true, cropSourceAssetId: true },
        });
        if (original) sources.push({ asset: original, suffix: "uncropped-original" });
      }
      for (const { asset: source, suffix } of sources) {
        if (!source.artworkData?.byteLength) continue;
        const key = `${label}-${source.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        files.push({ name: `${folder}/${suffix}-${label}-${slug(source.fileName)}`, data: Buffer.from(source.artworkData) });
      }
    }

    entries.push(...files);
    total += files.reduce((sum, file) => sum + file.data.byteLength, 0);
    included += 1;
  }

  return { entries, included, skipped: artworkIds.length - included };
}
