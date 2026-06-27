import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Use /api/payments/paymob/create-intent to create an order and start checkout." },
    { status: 410 },
  );
}
