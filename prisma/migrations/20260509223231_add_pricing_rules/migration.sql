-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "fabric" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "maxQty" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingRule_product_idx" ON "PricingRule"("product");

-- CreateIndex
CREATE INDEX "PricingRule_fabric_idx" ON "PricingRule"("fabric");

-- CreateIndex
CREATE INDEX "PricingRule_minQty_idx" ON "PricingRule"("minQty");

-- CreateIndex
CREATE INDEX "PricingRule_maxQty_idx" ON "PricingRule"("maxQty");
