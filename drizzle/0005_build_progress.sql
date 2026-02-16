-- Add build progress tracking and retry columns to site_build
ALTER TABLE "site_build" ADD COLUMN IF NOT EXISTS "stage" text;
ALTER TABLE "site_build" ADD COLUMN IF NOT EXISTS "percent" integer DEFAULT 0;
ALTER TABLE "site_build" ADD COLUMN IF NOT EXISTS "message" text;
ALTER TABLE "site_build" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 0;
ALTER TABLE "site_build" ADD COLUMN IF NOT EXISTS "started_at" timestamp;
