-- Аудит опубликованных страниц после публикации (место проверок `audit`, packages/storefront-builder/src/audit/).
-- После сборки с исходом live сборщик ставит задания на изменённые страницы (не больше 5), проверяющий процесс прогоняет
-- Lighthouse по опубликованной странице, сборщик пишет сюда итог и сравнивает его с прошлым аудитом той же страницы.
-- Строка на магазин, сборку и страницу. status done — метрики заполнены; failed — «не отработал», причина в reason.
-- previous — метрики прошлого аудита, с которыми сравнивали; findings — находки «стало хуже» (CheckFinding).
-- Новая таблица, старые не меняются — миграция обратно совместима и повторяется без ошибки.
CREATE TABLE IF NOT EXISTS "storefront_audit" (
  "site_id" text NOT NULL,
  "build" bigint NOT NULL,
  "path" text NOT NULL,
  "page_id" text NOT NULL,
  "status" text NOT NULL,
  "reason" text,
  "perf" real,
  "lcp_ms" integer,
  "fcp_ms" integer,
  "tbt_ms" integer,
  "cls" real,
  "si_ms" integer,
  "lcp_element" text,
  "lcp_section" text,
  "opportunities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "previous" jsonb,
  "findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "measured_at" timestamp with time zone NOT NULL,
  CONSTRAINT "storefront_audit_site_id_build_path_pk" PRIMARY KEY ("site_id", "build", "path"),
  CONSTRAINT "storefront_audit_status_check" CHECK ("status" IN ('done', 'failed'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storefront_audit_site_path" ON "storefront_audit" ("site_id", "path", "measured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storefront_audit_site_page" ON "storefront_audit" ("site_id", "page_id", "measured_at");
