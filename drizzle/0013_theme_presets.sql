-- Phase 2e: theme becomes a "preset" — metadata + tokens + default content + fonts to preload.
-- `site.custom_tokens` allows per-tenant overrides of theme-level tokens without mutating the preset.

ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "tokens" jsonb;--> statement-breakpoint
ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "content" jsonb;--> statement-breakpoint
ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "fonts_preload" jsonb;--> statement-breakpoint
ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "preset_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "custom_tokens" jsonb;
