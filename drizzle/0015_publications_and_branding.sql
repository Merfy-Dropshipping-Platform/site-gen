ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "branding" jsonb;

DO $$ BEGIN
  CREATE TYPE "public"."publication_status" AS ENUM(
    'draft',
    'scheduled',
    'published',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."publication_category" AS ENUM(
    'news',
    'blog',
    'articles'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "publications" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" varchar(255) NOT NULL,
  "site_id" text NOT NULL,
  "title" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL,
  "category" "publication_category" DEFAULT 'news' NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "excerpt" varchar(500) DEFAULT '',
  "cover_image_url" text,
  "status" "publication_status" DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_publications_org"
  ON "publications" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_publications_site"
  ON "publications" ("site_id");
CREATE INDEX IF NOT EXISTS "idx_publications_status"
  ON "publications" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_publications_slug_site"
  ON "publications" ("slug", "site_id");
