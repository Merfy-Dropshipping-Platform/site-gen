-- Волна 1 порта контента (src/content/): какой адаптер StoreContent
-- читает/пишет ревизию магазина. Сегодня единственное значение — 'document'
-- (DocumentAdapter, путь конструктора без изменений). 'delta' зарезервировано
-- под модель слоёв (merfy-mcp/docs/plans/2026-09-21-deltas-and-port.md §5).
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "content_model" text NOT NULL DEFAULT 'document';
