-- AlterTable
ALTER TABLE "BuildDraft" ADD COLUMN     "artworkLayers" JSONB,
ADD COLUMN     "backAiMockupFingerprint" TEXT,
ADD COLUMN     "backAiMockupId" TEXT,
ADD COLUMN     "backPrintMockupFingerprint" TEXT,
ADD COLUMN     "backPrintMockupId" TEXT;
