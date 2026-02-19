-- site_product table already created in 0004_site_product.sql
-- site_build columns already added in 0005_build_progress.sql
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "islands_enabled" boolean DEFAULT false NOT NULL;