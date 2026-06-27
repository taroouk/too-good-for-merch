import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Use /api/payments/paymob/create-intent for Paymob checkout." },
    { status: 410 },
  );
}
