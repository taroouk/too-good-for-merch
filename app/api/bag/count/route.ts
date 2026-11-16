import { NextResponse } from "next/server";
import { getUserId } from "src/studio/authz"; // database-backed: a blocked user is signed out
import { prisma } from "src/lib/prisma";

// Item count for the "My bag" badge in the site header. Signed-out
// visitors simply have 0.
export async function GET() {
  const userId = await getUserId();
  const headers = { "Cache-Control": "no-store" };
  if (!userId) return NextResponse.json({ count: 0 }, { headers });
  try {
    const count = await prisma.bagItem.count({ where: { userId: userId } });
    return NextResponse.json({ count }, { headers });
  } catch {
    return NextResponse.json({ count: 0 }, { headers });
  }
}
