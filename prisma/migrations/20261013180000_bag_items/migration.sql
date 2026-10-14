-- Additive: one new table, safe to apply ahead of the code deploy.
CREATE TABLE "BagItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT 'M',

    CONSTRAINT "BagItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BagItem_userId_idx" ON "BagItem"("userId");

CREATE UNIQUE INDEX "BagItem_userId_buildId_key" ON "BagItem"("userId", "buildId");

ALTER TABLE "BagItem" ADD CONSTRAINT "BagItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BagItem" ADD CONSTRAINT "BagItem_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;
