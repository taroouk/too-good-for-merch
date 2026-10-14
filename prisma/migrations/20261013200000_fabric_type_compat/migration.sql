-- Compatibility safety net (additive, no data touched). See the comment on
-- `enum FabricType` in schema.prisma: servers running code from before
-- 20261012170000_catalog_fabrics_products still cast fabric values to this
-- type; the TEXT columns accept the assignment. Idempotent so it can also be
-- applied by hand to a database where the type was already re-created.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FabricType') THEN
    CREATE TYPE "FabricType" AS ENUM ('ESSENTIALS_170', 'SIGNATURE_200', 'HEAVYWEIGHT_300');
  END IF;
END
$$;
