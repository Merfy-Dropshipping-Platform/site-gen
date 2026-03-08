-- Add immutable storage_slug column for stable S3 path derivation
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "storage_slug" text;

-- Backfill from existing publicUrl: https://cdf63de393ab.merfy.ru -> cdf63de393ab
UPDATE "site"
SET "storage_slug" = split_part(
  regexp_replace(
    regexp_replace("public_url", '^https?://', ''),
    '/$', ''
  ),
  '.', 1
)
WHERE "public_url" IS NOT NULL AND "storage_slug" IS NULL;
