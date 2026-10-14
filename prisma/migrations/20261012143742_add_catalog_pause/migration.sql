-- CreateTable
CREATE TABLE "CatalogPause" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "fabric" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPause_product_fabric_key" ON "CatalogPause"("product", "fabric");
