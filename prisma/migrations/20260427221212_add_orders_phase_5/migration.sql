/*
  Warnings:

  - You are about to drop the column `access_token` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `expires_at` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `id_token` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `scope` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `session_state` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `token_type` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `total` on the `Order` table. All the data in the column will be lost.
  - The `status` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `qty` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `OrderItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[orderNumber]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `orderNumber` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotalCents` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalCents` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `color` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fabric` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `placements` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalCents` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPriceCents` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'PAID', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED');

-- DropIndex
DROP INDEX "Account_userId_idx";

-- DropIndex
DROP INDEX "Asset_createdAt_idx";

-- DropIndex
DROP INDEX "Asset_status_idx";

-- DropIndex
DROP INDEX "BuildDraft_color_idx";

-- DropIndex
DROP INDEX "BuildDraft_fabric_idx";

-- DropIndex
DROP INDEX "BuildDraft_product_idx";

-- DropIndex
DROP INDEX "Design_buildId_idx";

-- DropIndex
DROP INDEX "Design_createdAt_idx";

-- DropIndex
DROP INDEX "DesignPlacement_assetId_idx";

-- DropIndex
DROP INDEX "DesignPlacement_placement_idx";

-- DropIndex
DROP INDEX "Order_createdAt_idx";

-- DropIndex
DROP INDEX "OrderItem_orderId_idx";

-- DropIndex
DROP INDEX "Session_userId_idx";

-- AlterTable
ALTER TABLE "Account" DROP COLUMN "access_token",
DROP COLUMN "expires_at",
DROP COLUMN "id_token",
DROP COLUMN "refresh_token",
DROP COLUMN "scope",
DROP COLUMN "session_state",
DROP COLUMN "token_type";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "total",
ADD COLUMN     "buildId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EGP',
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "orderNumber" TEXT NOT NULL,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "paymobIntentionId" TEXT,
ADD COLUMN     "paymobOrderId" TEXT,
ADD COLUMN     "paymobTransactionId" TEXT,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL,
ADD COLUMN     "totalCents" INTEGER NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "qty",
DROP COLUMN "unitPrice",
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "color" "GarmentColor" NOT NULL,
ADD COLUMN     "fabric" "FabricType" NOT NULL,
ADD COLUMN     "placements" JSONB NOT NULL,
ADD COLUMN     "preview" JSONB,
ADD COLUMN     "product" "ProductType" NOT NULL,
ADD COLUMN     "quantity" INTEGER NOT NULL,
ADD COLUMN     "totalCents" INTEGER NOT NULL,
ADD COLUMN     "unitPriceCents" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "AdminNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,

    CONSTRAINT "AdminNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
