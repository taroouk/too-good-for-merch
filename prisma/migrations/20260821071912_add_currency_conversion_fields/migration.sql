-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "canonicalTotalUsdCents" INTEGER,
ADD COLUMN     "exchangeRateAt" TIMESTAMP(3),
ADD COLUMN     "exchangeRateUsed" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "usdToEgpRate" DOUBLE PRECISION;
