-- Convert the four FabricType enum columns to TEXT IN PLACE (USING keeps every
-- existing value; Prisma's auto-generated diff would DROP COLUMN and lose them).
ALTER TABLE "BespokeRequest" ALTER COLUMN "fabric" TYPE TEXT USING "fabric"::text;
ALTER TABLE "BuildDraft" ALTER COLUMN "fabric" TYPE TEXT USING "fabric"::text;
ALTER TABLE "OrderItem" ALTER COLUMN "fabric" TYPE TEXT USING "fabric"::text;
ALTER TABLE "WishlistItem" ALTER COLUMN "fabric" TYPE TEXT USING "fabric"::text;

-- DropEnum (no column uses it any more)
DROP TYPE "FabricType";

-- CreateTable
CREATE TABLE "CatalogFabric" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gsm" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogFabric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "product" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("product")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogFabric_key_key" ON "CatalogFabric"("key");

-- Seed the catalog with exactly what the Studio hard-coded before, so
-- behaviour is unchanged the moment this migration lands.
INSERT INTO "CatalogFabric" ("id", "key", "name", "gsm", "description", "sortOrder", "updatedAt") VALUES
  ('seed_fabric_essentials', 'ESSENTIALS_170', 'ESSENTIALS', '170 GSM Cotton', 'Lightweight everyday cotton with a clean minimal hand feel.', 10, CURRENT_TIMESTAMP),
  ('seed_fabric_signature', 'SIGNATURE_200', 'SIGNATURE', '200 GSM Cotton', 'Our balanced premium weight. Smooth, buttery, structured, and designed to hold its shape.', 20, CURRENT_TIMESTAMP),
  ('seed_fabric_heavyweight', 'HEAVYWEIGHT_300', 'HEAVYWEIGHT', '300 GSM Cotton', 'Dense luxury cotton with elevated structure and a substantial drape.', 30, CURRENT_TIMESTAMP);

INSERT INTO "CatalogProduct" ("product", "name", "tagline", "updatedAt") VALUES
  ('FITTED', 'Fitted T-Shirt', 'Classic', CURRENT_TIMESTAMP),
  ('OVERSIZED', 'Oversized T-Shirt', 'Relaxed', CURRENT_TIMESTAMP);
