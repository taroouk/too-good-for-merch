import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

// Item count for the "My bag" badge in the site header. Signed-out
// visitors simply have 0.
export async function GET() {
  const session = await auth();
  const headers = { "Cache-Control": "no-store" };
  if (!session?.user?.id) return NextResponse.json({ count: 0 }, { headers });
  try {
    const count = await prisma.bagItem.count({ where: { userId: session.user.id } });
    return NextResponse.json({ count }, { headers });
  } catch {
    return NextResponse.json({ count: 0 }, { headers });
  }
}
