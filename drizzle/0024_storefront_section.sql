-- Реестр секций витрины (merfy-mcp/docs/plans/storefront-shell/07-sdk-shell/design.md, С7-10 Б «одна общая
-- таблица», С7-20 Б): строка на каждую принятую правку секции или глобального скрипта любого автора — платформы, темы,
-- магазина, расширения. Готовый файл скрипта — в storefront/blobs по sha256; в строке — его отпечаток и текст: сборка
-- магазина берёт код из строки. Выпуски платформы, темы и расширения подписаны версией (release) и не меняются. У своей
-- секции магазина версии нет: draft — текущая правка (её видит превью), published — правка на витрине. Новая таблица,
-- старые не меняются — миграция обратно совместима.
CREATE TABLE IF NOT EXISTS "storefront_section" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "author" text NOT NULL,
  "owner" text NOT NULL,
  "release" text,
  "source_hash" text NOT NULL,
  "content_hash" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "source" jsonb NOT NULL,
  "template" text NOT NULL,
  "style" text NOT NULL,
  "script" text,
  "script_hash" text,
  "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "draft" boolean DEFAULT false NOT NULL,
  "published" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "storefront_section_kind_check" CHECK ("kind" IN ('section', 'global')),
  CONSTRAINT "storefront_section_author_check" CHECK ("author" IN ('platform', 'theme', 'shop', 'extension')),
  CONSTRAINT "storefront_section_release_check" CHECK (("author" = 'shop') = ("release" IS NULL)),
  CONSTRAINT "storefront_section_script_check" CHECK (("script" IS NULL) = ("script_hash" IS NULL)),
  CONSTRAINT "storefront_section_flags_check" CHECK ("author" = 'shop' OR NOT ("draft" OR "published"))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_storefront_section_release" ON "storefront_section" ("author", "owner", "name", "release") WHERE "release" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_storefront_section_draft" ON "storefront_section" ("owner", "name") WHERE "draft";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_storefront_section_published" ON "storefront_section" ("owner", "name") WHERE "published";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storefront_section_owner_name" ON "storefront_section" ("author", "owner", "name", "created_at");
