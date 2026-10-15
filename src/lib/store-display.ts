import { prisma } from "src/lib/prisma";
import { effectiveDisplay, USD_DISPLAY, type StoreDisplay } from "src/pricing/display";

// The currency customers see prices in. Never throws: a failed lookup shows
// USD (the canonical pricing currency), same as an unset EGP rate.
export async function getStoreDisplay(): Promise<StoreDisplay> {
  const settings = await prisma.storeSetting
    .findUnique({ where: { id: "store" }, select: { displayCurrency: true, usdToEgpRate: true } })
    .catch(() => null);
  return settings ? effectiveDisplay(settings.displayCurrency, settings.usdToEgpRate) : USD_DISPLAY;
}
