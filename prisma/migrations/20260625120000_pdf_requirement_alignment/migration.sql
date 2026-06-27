CREATE TABLE "PlacementPricingRule" (
    "id" TEXT NOT NULL,
    "placement" "PlacementType" NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlacementPricingRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlacementPricingRule_placement_key" ON "PlacementPricingRule"("placement");
CREATE INDEX "PlacementPricingRule_placement_idx" ON "PlacementPricingRule"("placement");
