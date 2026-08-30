import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { canAccessBuild } from "src/studio/permissions";

export const runtime = "nodejs";

// Serves the exact persisted bytes of a canonical Artwork. Same private
// cache + sandbox CSP posture as app/api/mockups/[id]/file/route.ts.
// Authorised for: an admin, the owning user, or (for a guest-build
// artwork with no owner yet) whoever holds the guest-build cookie.
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const artwork = await prisma.artwork.findUnique({
    where: { id },
    select: {
      id: true,
      mimeType: true,
      data: true,
      userId: true,
      build: { select: { id: true, userId: true } },
    },
  });

  if (!artwork) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }

  const session = await auth();
  const sessionUserId = session?.user?.id ?? null;
  const allowed =
    session?.user?.role === Role.ADMIN ||
    (artwork.userId != null && artwork.userId === sessionUserId) ||
    (artwork.userId == null &&
      artwork.build != null &&
      (await canAccessBuild(sessionUserId, artwork.build)));

  if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  if (!artwork.data) {
    return NextResponse.json({ error: "Artwork file missing." }, { status: 404 });
  }

  const file = Buffer.from(artwork.data);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": artwork.mimeType ?? "application/octet-stream",
      "Content-Length": String(file.byteLength),
      "Content-Disposition": `inline; filename="artwork-${artwork.id}.png"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; script-src 'none'; object-src 'none'; base-uri 'none'",
    },
  });
}
