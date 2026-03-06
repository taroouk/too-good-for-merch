-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('FITTED', 'OVERSIZED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GarmentColor" AS ENUM ('BLACK', 'WHITE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FabricType" AS ENUM ('ESSENTIALS_170', 'SIGNATURE_200', 'HEAVYWEIGHT_300');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PlacementType" AS ENUM ('LEFT_CHEST', 'RIGHT_CHEST', 'RIGHT_SLEEVE', 'LEFT_SLEEVE', 'CENTER_FRONT', 'FULL_FRONT', 'CENTER_BACK', 'FULL_BACK');

-- AlterTable
ALTER TABLE "Build" ADD COLUMN     "status" "BuildStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "BuildDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildId" TEXT NOT NULL,
    "product" "ProductType",
    "color" "GarmentColor",
    "fabric" "FabricType",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "customNotes" TEXT,
    "primaryAssetId" TEXT,

    CONSTRAINT "BuildDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildId" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storageKey" TEXT,
    "url" TEXT,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildId" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignPlacement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "designId" TEXT NOT NULL,
    "placement" "PlacementType" NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "DesignPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildDraft_buildId_key" ON "BuildDraft"("buildId");

-- CreateIndex
CREATE INDEX "BuildDraft_product_idx" ON "BuildDraft"("product");

-- CreateIndex
CREATE INDEX "BuildDraft_color_idx" ON "BuildDraft"("color");

-- CreateIndex
CREATE INDEX "BuildDraft_fabric_idx" ON "BuildDraft"("fabric");

-- CreateIndex
CREATE INDEX "Asset_buildId_idx" ON "Asset"("buildId");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_createdAt_idx" ON "Asset"("createdAt");

-- CreateIndex
CREATE INDEX "Design_buildId_idx" ON "Design"("buildId");

-- CreateIndex
CREATE INDEX "Design_createdAt_idx" ON "Design"("createdAt");

-- CreateIndex
CREATE INDEX "DesignPlacement_assetId_idx" ON "DesignPlacement"("assetId");

-- CreateIndex
CREATE INDEX "DesignPlacement_placement_idx" ON "DesignPlacement"("placement");

-- CreateIndex
CREATE UNIQUE INDEX "DesignPlacement_designId_placement_key" ON "DesignPlacement"("designId", "placement");

-- CreateIndex
CREATE INDEX "Build_userId_idx" ON "Build"("userId");

-- CreateIndex
CREATE INDEX "Build_status_idx" ON "Build"("status");

-- CreateIndex
CREATE INDEX "Build_createdAt_idx" ON "Build"("createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- AddForeignKey
ALTER TABLE "BuildDraft" ADD CONSTRAINT "BuildDraft_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildDraft" ADD CONSTRAINT "BuildDraft_primaryAssetId_fkey" FOREIGN KEY ("primaryAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignPlacement" ADD CONSTRAINT "DesignPlacement_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignPlacement" ADD CONSTRAINT "DesignPlacement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
