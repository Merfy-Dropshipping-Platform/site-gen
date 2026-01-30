-- Таблица для хранения локальных товаров сайта
-- Используется для генерации статических страниц без интеграции с Product Service
CREATE TABLE "site_product" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"compare_at_price" integer,
	"images" jsonb DEFAULT '[]'::jsonb,
	"slug" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

-- Индекс для быстрого поиска товаров по сайту
CREATE INDEX "idx_site_product_site_id" ON "site_product" ("site_id");

-- Индекс для сортировки
CREATE INDEX "idx_site_product_sort" ON "site_product" ("site_id", "sort_order");
