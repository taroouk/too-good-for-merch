import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Use the Studio project flow to create builds." },
    { status: 410 },
  );
}
