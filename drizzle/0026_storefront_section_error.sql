-- Ошибки секций витрины из браузеров (merfy-mcp/docs/plans/storefront-shell/11-analytics/plan.md, часть 4; блок 7,
-- С7-16 А). Ядро витрины шлёт запись через шлюз в очередь storefront_section_errors, сборщик витрин пишет её сюда:
-- одна строка на магазин, секцию, отпечаток скрипта, стадию, текст и минуту приёма; повтор — count. Автор, владелец и
-- выпуск — из реестра storefront_section на момент записи; незнакомый отпечаток не пишется. Адреса страницы, браузера и
-- данных покупателя нет. Счёт для автостопа выпуска (блок 10) — по minute. Новая таблица, старые не меняются —
-- миграция обратно совместима.
CREATE TABLE IF NOT EXISTS "storefront_section_error" (
  "site_id" text NOT NULL,
  "section" text NOT NULL,
  "script_hash" text NOT NULL,
  "author" text NOT NULL,
  "owner" text NOT NULL,
  "release" text,
  "stage" text NOT NULL,
  "message" text NOT NULL,
  "minute" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "storefront_section_error_stage_check" CHECK ("stage" IN ('load', 'define', 'mount', 'unmount', 'runtime')),
  CONSTRAINT "storefront_section_error_count_check" CHECK ("count" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_storefront_section_error_key" ON "storefront_section_error" ("site_id", "section", "script_hash", "stage", "minute", "message");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storefront_section_error_minute" ON "storefront_section_error" ("minute");
