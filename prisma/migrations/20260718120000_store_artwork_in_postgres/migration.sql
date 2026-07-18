-- Store customer-uploaded artwork in PostgreSQL instead of local filesystem storage.
ALTER TABLE "Asset" RENAME COLUMN "fileName" TO "filename";
ALTER TABLE "Asset" RENAME COLUMN "mimeType" TO "contentType";
ALTER TABLE "Asset" RENAME COLUMN "sizeBytes" TO "fileSize";

ALTER TABLE "Asset"
ADD COLUMN "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "artworkData" BYTEA,
ADD COLUMN "artworkSha256" VARCHAR(64);
