-- AlterTable
ALTER TABLE "BuildDraft" ADD COLUMN     "customQuoteNote" TEXT,
ADD COLUMN     "customQuoteUsdCents" INTEGER,
ADD COLUMN     "customQuotedAt" TIMESTAMP(3),
ADD COLUMN     "customQuotedByEmail" TEXT;
