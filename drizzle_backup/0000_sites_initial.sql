-- Enums
DO $$ BEGIN
  CREATE TYPE "public"."site_status" AS ENUM ('draft','published','frozen','archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."site_build_status" AS ENUM ('queued','running','failed','uploaded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."site_deployment_status" AS ENUM ('provisioning','deployed','disabled','failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS "site" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL,
  "name" text NOT NULL,
  "slug" text,
  "status" "public"."site_status" DEFAULT 'draft' NOT NULL,
  "theme" jsonb,
  "current_revision_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "created_by" text,
  "updated_by" text,
  "deleted_at" timestamp,
  "frozen_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_tenant_slug_unique"
  ON "site" ("tenant_id", COALESCE("slug", ''));

CREATE INDEX IF NOT EXISTS "site_tenant_idx" ON "site" ("tenant_id");

CREATE TABLE IF NOT EXISTS "site_domain" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "domain" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "verified_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_domain_unique" ON "site_domain" ("domain");
CREATE INDEX IF NOT EXISTS "site_domain_site_idx" ON "site_domain" ("site_id");

CREATE TABLE IF NOT EXISTS "site_revision" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "data" jsonb,
  "meta" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "created_by" text
);

CREATE INDEX IF NOT EXISTS "site_revision_site_idx" ON "site_revision" ("site_id");

CREATE TABLE IF NOT EXISTS "site_build" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "revision_id" text NOT NULL REFERENCES "site_revision"("id") ON DELETE CASCADE,
  "status" "public"."site_build_status" NOT NULL DEFAULT 'queued',
  "artifact_url" text,
  "s3_bucket" text,
  "s3_key_prefix" text,
  "log_url" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "error" text
);

CREATE INDEX IF NOT EXISTS "site_build_site_idx" ON "site_build" ("site_id");
CREATE INDEX IF NOT EXISTS "site_build_revision_idx" ON "site_build" ("revision_id");

CREATE TABLE IF NOT EXISTS "site_deployment" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "site"("id") ON DELETE CASCADE,
  "build_id" text NOT NULL REFERENCES "site_build"("id") ON DELETE CASCADE,
  "coolify_app_id" text,
  "coolify_env_id" text,
  "status" "public"."site_deployment_status" NOT NULL DEFAULT 'provisioning',
  "url" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "site_deployment_site_idx" ON "site_deployment" ("site_id");
CREATE INDEX IF NOT EXISTS "site_deployment_build_idx" ON "site_deployment" ("build_id");

