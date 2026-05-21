import { NextResponse } from "next/server";
import { prisma } from "../../../src/lib/prisma";

export async function GET(request: Request) {
  const build = await prisma.build.create({
    data: {
      draft: {
        create: {
          quantity: 1,
        },
      },
    },
  });

  const url = new URL(`/studio/projects/${build.id}/builder`, request.url);
  return NextResponse.redirect(url);
}