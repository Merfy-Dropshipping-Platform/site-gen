-- Блоги магазина вместо категорий публикаций (контракт «Публикации», PUB-3, PUB-10, PUB-12; 20.10.2026).
--
-- 1. Таблица blogs; каждому магазину — блог «Новости» (novosti).
-- 2. Записи с category = news → «Новости»/novosti, blog → «Блог»/blog, articles → «Статьи»/stati. «Блог» и «Статьи»
--    создаются только там, где есть записи с такой категорией. Блоги заводятся и для site_id записей, у которых нет
--    строки в site (сироты): ни одна запись не теряется, иначе blog_id NOT NULL не встанет и миграция откатится целиком.
-- 3. publications.blog_id NOT NULL с внешним ключом, затем category и enum publication_category удаляются.
-- 4. SEO-поля записи; excerpt без значения по умолчанию: null = продавец анонс не задавал. Анонсы, которые сервис
--    раньше сам считал из текста (первые 200 знаков без HTML) или пустые, становятся null — заданные продавцом
--    остаются как есть.
-- 5. publication_redirects — прежние адреса записей для 301.
--
-- Шаги 2–3 выполняются, только пока колонка category существует: повторный прогон ничего не ломает.
CREATE TABLE IF NOT EXISTS "blogs" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "organization_id" varchar(255) NOT NULL,
  "title" text NOT NULL,
  "handle" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_blogs_site_handle" ON "blogs" ("site_id", "handle");--> statement-breakpoint
INSERT INTO "blogs" ("id", "site_id", "organization_id", "title", "handle")
SELECT gen_random_uuid()::text, s."id", s."tenant_id", 'Новости', 'novosti'
  FROM "site" s
ON CONFLICT ("site_id", "handle") DO NOTHING;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "blog_id" text;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'publications' AND column_name = 'category'
  ) THEN
    INSERT INTO "blogs" ("id", "site_id", "organization_id", "title", "handle")
    SELECT gen_random_uuid()::text, p."site_id", min(p."organization_id"), m."title", m."handle"
      FROM "publications" p
      JOIN (VALUES ('news', 'Новости', 'novosti'), ('blog', 'Блог', 'blog'), ('articles', 'Статьи', 'stati'))
        AS m("category", "title", "handle") ON m."category" = p."category"::text
     GROUP BY p."site_id", m."title", m."handle"
    ON CONFLICT ("site_id", "handle") DO NOTHING;

    UPDATE "publications" p
       SET "blog_id" = b."id"
      FROM "blogs" b
     WHERE p."blog_id" IS NULL
       AND b."site_id" = p."site_id"
       AND b."handle" = CASE p."category"::text
                          WHEN 'news' THEN 'novosti'
                          WHEN 'blog' THEN 'blog'
                          WHEN 'articles' THEN 'stati'
                        END;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "publications" ALTER COLUMN "blog_id" SET NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "publications"
    ADD CONSTRAINT "publications_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "blogs"("id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_publications_blog" ON "publications" ("blog_id");--> statement-breakpoint
ALTER TABLE "publications" DROP COLUMN IF EXISTS "category";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."publication_category";--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "seo_title" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "seo_description" text;--> statement-breakpoint
ALTER TABLE "publications" ALTER COLUMN "excerpt" DROP DEFAULT;--> statement-breakpoint
UPDATE "publications"
   SET "excerpt" = NULL
 WHERE "excerpt" IS NOT NULL
   AND (btrim("excerpt") = ''
        OR "excerpt" = substr(regexp_replace("content", '<[^>]*>', '', 'g'), 1, 200));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publication_redirects" (
  "site_id" text NOT NULL,
  "old_path" text NOT NULL,
  "publication_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "publication_redirects_site_id_old_path_pk" PRIMARY KEY ("site_id", "old_path"),
  CONSTRAINT "publication_redirects_publication_id_publications_id_fk"
    FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_publication_redirects_publication" ON "publication_redirects" ("publication_id");
