-- CreateEnum
CREATE TYPE "BespokeRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'ACCEPTED', 'DECLINED', 'CLOSED');

-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN     "bespokeRequestId" TEXT;

-- AlterTable
ALTER TABLE "BuildDraft" ADD COLUMN     "artworkPlacement" JSONB,
ADD COLUMN     "savedArtworkId" TEXT;

-- CreateTable
CREATE TABLE "Artwork" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "buildId" TEXT,
    "sourceMockupId" TEXT,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "model" TEXT,
    "prompt" TEXT,

    CONSTRAINT "Artwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "artworkId" TEXT,
    "product" "ProductType",
    "color" "GarmentColor",
    "fabric" "FabricType",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "size" TEXT,
    "placements" JSONB NOT NULL,
    "transform" JSONB,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BespokeRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "buildId" TEXT,
    "artworkId" TEXT,
    "status" "BespokeRequestStatus" NOT NULL DEFAULT 'NEW',
    "product" "ProductType",
    "color" "GarmentColor",
    "fabric" "FabricType",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "size" TEXT,
    "placements" JSONB NOT NULL,
    "transform" JSONB,
    "customNotes" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "quoteUsdCents" INTEGER,
    "quoteNote" TEXT,
    "quotedAt" TIMESTAMP(3),
    "quotedByEmail" TEXT,
    "emailNotifiedAt" TIMESTAMP(3),
    "whatsappNotifiedAt" TIMESTAMP(3),
    "notifyError" TEXT,

    CONSTRAINT "BespokeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BespokeRequestNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,

    CONSTRAINT "BespokeRequestNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Artwork_sourceMockupId_key" ON "Artwork"("sourceMockupId");

-- CreateIndex
CREATE INDEX "Artwork_userId_idx" ON "Artwork"("userId");

-- CreateIndex
CREATE INDEX "Artwork_buildId_idx" ON "Artwork"("buildId");

-- CreateIndex
CREATE INDEX "WishlistItem_userId_idx" ON "WishlistItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_userId_buildId_key" ON "WishlistItem"("userId", "buildId");

-- CreateIndex
CREATE UNIQUE INDEX "BespokeRequest_requestNumber_key" ON "BespokeRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "BespokeRequest_userId_idx" ON "BespokeRequest"("userId");

-- CreateIndex
CREATE INDEX "BespokeRequest_status_idx" ON "BespokeRequest"("status");

-- CreateIndex
CREATE INDEX "BespokeRequest_createdAt_idx" ON "BespokeRequest"("createdAt");

-- CreateIndex
CREATE INDEX "BespokeRequestNote_requestId_idx" ON "BespokeRequestNote"("requestId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_bespokeRequestId_idx" ON "AdminAuditLog"("bespokeRequestId");

-- AddForeignKey
ALTER TABLE "BuildDraft" ADD CONSTRAINT "BuildDraft_savedArtworkId_fkey" FOREIGN KEY ("savedArtworkId") REFERENCES "Artwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_bespokeRequestId_fkey" FOREIGN KEY ("bespokeRequestId") REFERENCES "BespokeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artwork" ADD CONSTRAINT "Artwork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artwork" ADD CONSTRAINT "Artwork_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BespokeRequest" ADD CONSTRAINT "BespokeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BespokeRequest" ADD CONSTRAINT "BespokeRequest_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BespokeRequest" ADD CONSTRAINT "BespokeRequest_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BespokeRequestNote" ADD CONSTRAINT "BespokeRequestNote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BespokeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BespokeRequestNote" ADD CONSTRAINT "BespokeRequestNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

