import { NextResponse } from "next/server";
import { getAdminUser } from "src/lib/admin/auth";
import { buildArtworkZipEntries, paidArtworkRows } from "src/lib/admin/artwork-export";
import { createZip } from "src/lib/zip";

export const runtime = "nodejs";

// One artwork: the mockup + every original upload placed on it, as a .zip.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { id } = await params;

  const paid = (await paidArtworkRows()).find((row) => row.artworkId === id);
  const { entries } = await buildArtworkZipEntries([id], { orderNumbers: paid ? new Map([[id, paid.orderNumber]]) : undefined });
  if (!entries.length) return NextResponse.json({ error: "Nothing to download for this artwork." }, { status: 404 });

  const zip = createZip(entries);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.byteLength),
      "Content-Disposition": `attachment; filename="${paid ? `order-${paid.orderNumber}` : `artwork-${id.slice(-8)}`}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
