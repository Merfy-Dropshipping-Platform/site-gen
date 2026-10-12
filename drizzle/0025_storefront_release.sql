-- Выпуск версий новых тем, платформы и расширений волнами (merfy-mcp/docs/plans/storefront-shell/10-theme-release/
-- design.md, раздел 4, «Автостоп и журнал выпуска»). Две новые таблицы, старые не меняются — миграция обратно совместима.
--   storefront_release      — выпуск: вид и предмет, версии «с» и «на», отпечаток версии, контур, кто запустил,
--                             состояние, текущая волна и время следующей, причина остановки, отчёт;
--   storefront_release_shop — магазин выпуска: волна и место, состояние, сборки до и после, паспорта до и после,
--                             вердикт и ошибка.
-- Один активный выпуск на контуре — частичный уникальный индекс. Номер выпуска — зерно порядка волн.
CREATE TABLE IF NOT EXISTS "storefront_release" (
  "id" serial PRIMARY KEY,
  "kind" text NOT NULL,
  "subject" text NOT NULL,
  "from_version" text NOT NULL,
  "to_version" text NOT NULL,
  "to_hash" text NOT NULL,
  "contour" text NOT NULL,
  "started_by" text NOT NULL,
  "status" text NOT NULL,
  "wave" integer DEFAULT 0 NOT NULL,
  "next_wave_at" timestamp with time zone,
  "stop_reason" text,
  "report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "storefront_release_kind_check" CHECK ("kind" IN ('theme', 'platform', 'extension')),
  CONSTRAINT "storefront_release_status_check" CHECK ("status" IN ('planning', 'queued', 'testing', 'awaiting', 'waves', 'finished', 'stopped', 'reverted'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_storefront_release_active" ON "storefront_release" ("contour")
  WHERE "status" IN ('planning', 'testing', 'awaiting', 'waves');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storefront_release_subject" ON "storefront_release" ("kind", "subject", "contour", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storefront_release_shop" (
  "release_id" integer NOT NULL REFERENCES "storefront_release" ("id") ON DELETE CASCADE,
  "site_id" text NOT NULL,
  "wave" integer NOT NULL,
  "position" integer NOT NULL,
  "status" text DEFAULT 'waiting' NOT NULL,
  "build_before" bigint,
  "build_after" bigint,
  "version_before" text,
  "passport_before" jsonb,
  "passport_after" jsonb,
  "verdict" text,
  "error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "storefront_release_shop_pk" PRIMARY KEY ("release_id", "site_id"),
  CONSTRAINT "storefront_release_shop_status_check" CHECK ("status" IN ('waiting', 'before', 'building', 'checking', 'done', 'skipped', 'broken', 'reverted'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storefront_release_shop_wave" ON "storefront_release_shop" ("release_id", "wave", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storefront_release_shop_site_id" ON "storefront_release_shop" ("site_id");
