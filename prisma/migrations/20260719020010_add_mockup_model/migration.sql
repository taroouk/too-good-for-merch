-- AlterTable
ALTER TABLE "BuildDraft" ADD COLUMN     "aiMockupFingerprint" TEXT,
ADD COLUMN     "aiMockupGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "aiMockupId" TEXT;

-- CreateTable
CREATE TABLE "Mockup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildId" TEXT NOT NULL,
    "assetId" TEXT,
    "mimeType" TEXT,
    "data" BYTEA NOT NULL,
    "sha256" VARCHAR(64),
    "model" TEXT,
    "placement" TEXT,
    "fingerprint" TEXT,
    "prompt" TEXT,

    CONSTRAINT "Mockup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mockup_buildId_idx" ON "Mockup"("buildId");

-- CreateIndex
CREATE INDEX "Mockup_fingerprint_idx" ON "Mockup"("fingerprint");

-- AddForeignKey
ALTER TABLE "BuildDraft" ADD CONSTRAINT "BuildDraft_aiMockupId_fkey" FOREIGN KEY ("aiMockupId") REFERENCES "Mockup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mockup" ADD CONSTRAINT "Mockup_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;
