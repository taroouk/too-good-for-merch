import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { canAccessBuild } from "src/studio/permissions";
import { getMockup } from "src/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const mockup = await prisma.mockup.findUnique({
    where: { id },
    select: {
      id: true,
      mimeType: true,
      build: { select: { id: true, userId: true } },
    },
  });

  if (!mockup) {
    return NextResponse.json({ error: "Mockup not found." }, { status: 404 });
  }

  const session = await auth();
  const allowed =
    session?.user?.role === Role.ADMIN ||
    (await canAccessBuild(session?.user?.id ?? null, mockup.build));
  if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const file = await getMockup(mockup.id);
  if (!file) {
    return NextResponse.json({ error: "Mockup file missing." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": mockup.mimeType ?? "application/octet-stream",
      "Content-Length": String(file.byteLength),
      "Content-Disposition": `inline; filename="mockup-${mockup.id}.jpg"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; script-src 'none'; object-src 'none'; base-uri 'none'",
    },
  });
}
