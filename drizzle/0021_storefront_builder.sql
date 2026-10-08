-- Сборщик магазинов новой темы (merfy-mcp/docs/plans/storefront-shell/06-builder-queue/design.md). Две новые
-- таблицы, старые не меняются — миграция обратно совместима.
--   storefront_shop  — строка магазина (В6-3 Б, В6-4 Б): идёт ли сборка, номер сборки, замок со сроком, «ещё раз»
--                      (pending — сколько событий ждут следующей сборки), повтор упавшей и «остановлено»;
--   storefront_build — строка на каждую сборку (В6-5 Б): время правки, постановки, старта и конца, итог, время шагов.
CREATE TABLE IF NOT EXISTS "storefront_shop" (
  "site_id" text PRIMARY KEY,
  "state" text DEFAULT 'idle' NOT NULL,
  "build" bigint DEFAULT 0 NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "events" integer DEFAULT 0 NOT NULL,
  "event_at" timestamp with time zone,
  "queued_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "lease_until" timestamp with time zone,
  "attempt" integer DEFAULT 0 NOT NULL,
  "retry_at" timestamp with time zone,
  "pending" integer DEFAULT 0 NOT NULL,
  "pending_priority" integer DEFAULT 0 NOT NULL,
  "pending_event_at" timestamp with time zone,
  "error" text,
  CONSTRAINT "storefront_shop_state_check" CHECK ("state" IN ('idle', 'busy', 'retrying', 'stopped'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storefront_build" (
  "site_id" text NOT NULL,
  "build" bigint NOT NULL,
  "attempt" integer NOT NULL,
  "priority" integer NOT NULL,
  "events" integer NOT NULL,
  "event_at" timestamp with time zone NOT NULL,
  "queued_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone NOT NULL,
  "outcome" text NOT NULL,
  "steps" jsonb NOT NULL,
  "error" text,
  CONSTRAINT "storefront_build_site_id_build_pk" PRIMARY KEY ("site_id", "build")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storefront_build_finished_at" ON "storefront_build" ("finished_at");
