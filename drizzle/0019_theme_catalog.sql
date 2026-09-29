-- Этап 3, кусок 3.4 (merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, И5):
-- каталог тем из базы. Аддитивно, без backfill:
--   owner_tenant_id — владелец темы (NULL = тема платформы; своя тема мерчанта — позже, вместе с MCP);
--   base_theme_id   — основа своей темы (NULL = тема сама себе основа);
--   fits_for        — «подходит для» (jsonb, список строк; заполняет загрузка пресетов на старте).
ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "owner_tenant_id" text;--> statement-breakpoint
ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "base_theme_id" text;--> statement-breakpoint
ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "fits_for" jsonb;
