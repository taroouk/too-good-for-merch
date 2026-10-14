-- Additive only: nullable columns + one new table. Safe to apply ahead of the
-- code deploy (old code ignores the new columns).
ALTER TABLE "Order"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "carrier" TEXT,
  ADD COLUMN "trackingNumber" TEXT,
  ADD COLUMN "trackingUrl" TEXT,
  ADD COLUMN "shippedAt" TIMESTAMP(3);

CREATE TABLE "LegalPage" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedByEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalPage_pkey" PRIMARY KEY ("slug")
);
