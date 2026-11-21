-- «Дизайн по ссылке» (21.11, контракт reports/vizi-design-copy/contract.md, раздел 3).
-- design_looks — снятые проверяющим процессом стиль и контур чужого сайта: строка на снятие. Пишет и читает шлюз через
-- RPC design.* в sites_queue; tool, tool_version и raw — только для разбора и стенда, наружу (агенту, мерчанту) не идут.
-- Повтор той же ссылки за сутки шлюз берёт отсюда (design.findRecent). Строки старше 30 дней чистит DesignStore.
-- design_owned_sites — мерчант подтвердил «сайт мой» (домен — нижний регистр, без www. и точки в конце, как его
-- нормализует шлюз): только тогда снимаются тексты и фото (content).
-- Новые таблицы, старые не меняются — миграция обратно совместима и повторяется без ошибки.
CREATE TABLE IF NOT EXISTS "design_looks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "url" text NOT NULL,
  "final_url" text NOT NULL,
  "tool" text NOT NULL,
  "tool_version" text NOT NULL,
  "outline_tool" text NOT NULL,
  "style" jsonb NOT NULL,
  "outline" jsonb NOT NULL,
  "content" jsonb,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ms" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_design_looks_site_id_created_at" ON "design_looks" ("site_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_design_looks_created_at" ON "design_looks" ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "design_owned_sites" (
  "site_id" text NOT NULL,
  "domain" text NOT NULL,
  "user_id" text NOT NULL,
  "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "design_owned_sites_site_id_domain_pk" PRIMARY KEY ("site_id", "domain")
);
