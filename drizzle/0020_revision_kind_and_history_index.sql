-- Этап 3, R3 (merfy-mcp/docs/plans/2026-09-30-revisions-clean.md): колонка
-- `kind` вместо `meta->>'kind'` (content/revision-kinds.ts) + индекс истории
-- магазина. Аддитивно, без ломающих изменений:
--   kind  — заполняется из meta->>'kind' для существующих строк, где он есть
--           (сегодня — только служебные снимки клиента, meta.kind =
--           'client-snapshot'); DocumentAdapter.commit() пишет обе копии
--           (колонку и meta.kind) — совместимость на время выкатки.
--   индекс idx_site_revision_site_id_created_at — история магазина сейчас
--           полный просмотр таблицы (индексов кроме id нет).
ALTER TABLE "site_revision" ADD COLUMN IF NOT EXISTS "kind" text;--> statement-breakpoint
UPDATE "site_revision" SET "kind" = "meta"->>'kind' WHERE "kind" IS NULL AND "meta"->>'kind' IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_site_revision_site_id_created_at" ON "site_revision" ("site_id", "created_at" DESC);
