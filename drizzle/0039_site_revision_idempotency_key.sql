-- Ключ от повторов записи агента (этап 3 «Запись Визи в черновик nova», К3). MCP шлёт Idempotency-Key на каждую запись
-- nova; sites кладёт его на ревизию, которую эта запись создала, а ответ записи (merged, overwritten, conflicts,
-- checkScope, id ревизий) — в meta.reply. Повтор с тем же ключом отдаёт сохранённый ответ и ничего не пишет; одновременный
-- дубль проигрывает уникальному индексу. Ключ уникален в пределах магазина: ключ другого магазина не пересекается.
-- NULL — запись без ключа (конструктор, снимки клиента, служебные записи): их индекс не касается.
-- Новый столбец и индекс, старые строки не меняются — миграция обратно совместима и повторяется без ошибки.
ALTER TABLE "site_revision" ADD COLUMN IF NOT EXISTS "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_site_revision_site_idempotency_key" ON "site_revision" ("site_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
