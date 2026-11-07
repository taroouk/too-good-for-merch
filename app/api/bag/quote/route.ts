import { NextResponse } from "next/server";
import { apiError, NO_STORE_HEADERS } from "src/lib/api/responses";
import { getUserId } from "src/studio/authz";
import { quoteCart } from "src/lib/orders/cart-checkout";
import { CheckoutError } from "src/lib/orders/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The checkout page's view of the whole bag: every line plus the single total the one payment will charge.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return apiError("Sign in to continue.", 401, NO_STORE_HEADERS);
  try {
    const quote = await quoteCart(userId);
    return NextResponse.json({ ...quote, walletEnabled: Boolean(process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim()) }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof CheckoutError) return apiError(error.message, error.status, NO_STORE_HEADERS);
    console.error("BAG_QUOTE_ERROR", error instanceof Error ? error.message : error);
    return apiError("We couldn't load your bag. Please try again.", 500, NO_STORE_HEADERS);
  }
}
