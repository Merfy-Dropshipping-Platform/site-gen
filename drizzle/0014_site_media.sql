-- Live media slots: merchant uploads through the constructor are stored
-- here keyed by (site_id, block_id). Live storefront fetches the current
-- URL at runtime via /api/sites/:id/blocks/:blockId/media, which means
-- changing a video or image doesn't require rebuilding the Astro
-- artifact or creating a new revision.

CREATE TABLE IF NOT EXISTS "site_media" (
  "site_id" uuid NOT NULL,
  "block_id" text NOT NULL,
  "url" text NOT NULL,
  "mime_type" text,
  "cover_image" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "site_media_pk" PRIMARY KEY ("site_id", "block_id"),
  CONSTRAINT "site_media_site_fk" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "site_media_site_idx" ON "site_media" ("site_id");
