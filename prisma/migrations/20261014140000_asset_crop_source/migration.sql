-- Additive: two nullable columns, no data touched. Safe to apply ahead of the code deploy.
ALTER TABLE "Asset" ADD COLUMN "cropSourceAssetId" TEXT, ADD COLUMN "cropMeta" JSONB;
