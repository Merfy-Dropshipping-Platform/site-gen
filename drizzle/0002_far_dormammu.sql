CREATE TABLE "theme" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"preview_desktop" text,
	"preview_mobile" text,
	"template_id" text NOT NULL,
	"price" integer DEFAULT 0,
	"tags" jsonb,
	"badge" text,
	"author" text DEFAULT 'merfy',
	"view_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT NOW(),
	"updated_at" timestamp DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "theme_id" text;
--> statement-breakpoint
-- Seed initial themes
INSERT INTO "theme" ("id", "name", "slug", "description", "preview_desktop", "preview_mobile", "template_id", "price", "tags", "badge", "author", "is_active", "created_at", "updated_at") VALUES
  ('rose', 'ROSE', 'rose', 'Элегантная тема для магазина одежды', '/img/themes/rose/ImageDeckstop.png', '/img/themes/rose/Phone.png', 'rose', 0, '["#Бесплатно", "#Одежда", "#Многостраничный"]', 'new', 'merfy', true, NOW(), NOW()),
  ('default', 'Default', 'default', 'Базовый шаблон', NULL, NULL, 'default', 0, '["#Бесплатно", "#Базовый"]', NULL, 'merfy', true, NOW(), NOW());