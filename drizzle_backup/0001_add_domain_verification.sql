ALTER TABLE "site_domain" ADD COLUMN IF NOT EXISTS "verification_token" text;
ALTER TABLE "site_domain" ADD COLUMN IF NOT EXISTS "verification_type" text;
