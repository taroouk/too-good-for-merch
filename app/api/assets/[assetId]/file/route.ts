import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { canAccessBuild } from "src/studio/permissions";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      fileName: true,
      mimeType: true,
      storageKey: true,
      build: { select: { id: true, userId: true } },
    },
  });

  if (!asset?.storageKey) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  const session = await auth();
  const allowed =
    session?.user?.role === Role.ADMIN ||
    (await canAccessBuild(session?.user?.id ?? null, asset.build));
  if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const storageRoot = path.resolve(process.cwd(), "storage");
  const filePath = path.resolve(storageRoot, asset.storageKey);
  if (filePath !== storageRoot && !filePath.startsWith(`${storageRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid storage key." }, { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": asset.mimeType ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${asset.fileName.replaceAll('"', "")}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; script-src 'none'; object-src 'none'; base-uri 'none'",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset file missing." }, { status: 404 });
  }
}
