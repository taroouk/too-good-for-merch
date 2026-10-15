import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAdminUser } from "src/lib/admin/auth";
import { buildArtworkZipEntries, paidArtworkRows } from "src/lib/admin/artwork-export";
import { prisma } from "src/lib/prisma";
import { createZip } from "src/lib/zip";

export const runtime = "nodejs";

const MAX_ARTWORKS = 200;

// Everything for every artwork matching the admin list's filter (all saved, or
// paid only, and the search text), newest first, in one .zip -- a folder per
// artwork. Capped so a single request can't exhaust memory; the archive says
// how many were left out.
export async function GET(req: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const paidOnly = url.searchParams.get("show") === "paid";

  const paidRows = await paidArtworkRows();
  const orderNumbers = new Map(paidRows.map((row) => [row.artworkId, row.orderNumber]));
  const base: Prisma.ArtworkWhereInput = paidOnly ? { id: { in: paidRows.map((row) => row.artworkId) } } : {};
  const where: Prisma.ArtworkWhereInput = q
    ? { AND: [base, { OR: [{ id: q }, { user: { email: { contains: q, mode: "insensitive" } } }, { prompt: { contains: q, mode: "insensitive" } }] }] }
    : base;

  const rows = await prisma.artwork.findMany({ where, orderBy: { createdAt: "desc" }, take: MAX_ARTWORKS, select: { id: true } });
  if (!rows.length) return NextResponse.json({ error: "No artworks to download." }, { status: 404 });

  const { entries, included, skipped } = await buildArtworkZipEntries(rows.map((row) => row.id), { orderNumbers });
  const total = await prisma.artwork.count({ where });
  const left = skipped + Math.max(0, total - rows.length);
  if (left > 0) {
    entries.push({
      name: "README.txt",
      data: Buffer.from(`${included} artworks are included. ${left} more matched but were left out to keep the download a manageable size.\nDownload them from the Artworks page one by one, or narrow the search.\n`),
    });
  }

  const zip = createZip(entries);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.byteLength),
      "Content-Disposition": `attachment; filename="artworks-${paidOnly ? "paid-" : ""}${stamp}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
