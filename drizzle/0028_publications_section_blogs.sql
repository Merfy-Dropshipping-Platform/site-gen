-- Секция «Публикации» в сохранённых ревизиях: категории → блоги (контракт «Публикации», PUB-3; 20.10.2026).
--
-- До 0027 секция выбирала записи по категории: publicationType / categoryFilter = news | blog | articles (или
-- русские подписи «Новости» | «Блог» | «Статьи»). Категории стали блогами (0027), и в конструкторе секция теперь
-- выбирает блог по id: publicationSource = 'blog', blogId = <id блога>. Здесь каждая такая секция во ВСЕХ ревизиях
-- магазина (site_revision.data, на любой глубине: pagesData.*.content, zones, корневой content) получает id блога
-- этого магазина по таблице 0027: news → novosti, blog → blog, articles → stati; блога нет — блог по умолчанию
-- (novosti). Старые поля получают тот же id — так их понимает и рендер витрины, и прежний конструктор.
--
-- Идемпотентна: секция с publicationSource не трогается, а id блога — не категория, повторный прогон ничего не
-- меняет. «Все публикации» ('' / all), выбранная запись (id/slug) и чужие секции остаются как были.
CREATE OR REPLACE FUNCTION "merfy_tmp_publications_blog_refs"(doc jsonb, blog_ids jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v jsonb;
  result jsonb;
  props jsonb;
  ref text;
  handle text;
  target text;
BEGIN
  IF jsonb_typeof(doc) = 'array' THEN
    SELECT COALESCE(jsonb_agg("merfy_tmp_publications_blog_refs"(e, blog_ids) ORDER BY i), '[]'::jsonb)
      INTO result
      FROM jsonb_array_elements(doc) WITH ORDINALITY AS t(e, i);
    RETURN result;
  END IF;
  IF jsonb_typeof(doc) <> 'object' THEN
    RETURN doc;
  END IF;

  result := '{}'::jsonb;
  FOR k, v IN SELECT * FROM jsonb_each(doc) LOOP
    result := result || jsonb_build_object(k, "merfy_tmp_publications_blog_refs"(v, blog_ids));
  END LOOP;

  IF result->>'type' IS DISTINCT FROM 'Publications' OR jsonb_typeof(result->'props') IS DISTINCT FROM 'object' THEN
    RETURN result;
  END IF;
  props := result->'props';
  IF props ? 'publicationSource' THEN
    RETURN result;
  END IF;
  -- Как читает секция (resolvePublicationsType): непустой publicationType главнее categoryFilter.
  ref := lower(btrim(COALESCE(NULLIF(btrim(props->>'publicationType'), ''), props->>'categoryFilter', '')));
  handle := CASE ref
              WHEN 'news' THEN 'novosti' WHEN 'новости' THEN 'novosti'
              WHEN 'blog' THEN 'blog' WHEN 'блог' THEN 'blog'
              WHEN 'articles' THEN 'stati' WHEN 'статьи' THEN 'stati'
            END;
  IF handle IS NULL THEN
    RETURN result;
  END IF;
  target := COALESCE(blog_ids->>handle, blog_ids->>'novosti');
  IF target IS NULL THEN
    RETURN result;
  END IF;

  props := props || jsonb_build_object('publicationSource', 'blog', 'blogId', target, 'publicationType', target);
  IF lower(btrim(COALESCE(props->>'categoryFilter', ''))) IN ('news', 'новости', 'blog', 'блог', 'articles', 'статьи') THEN
    props := props || jsonb_build_object('categoryFilter', target);
  END IF;
  RETURN jsonb_set(result, '{props}', props);
END $$;--> statement-breakpoint
UPDATE "site_revision" r
   SET "data" = "merfy_tmp_publications_blog_refs"(r."data", b."ids")
  FROM (SELECT "site_id", jsonb_object_agg("handle", "id") AS "ids" FROM "blogs" GROUP BY "site_id") b
 WHERE b."site_id" = r."site_id"
   AND r."data" IS NOT NULL
   AND r."data"::text LIKE '%Publications%';--> statement-breakpoint
DROP FUNCTION IF EXISTS "merfy_tmp_publications_blog_refs"(jsonb, jsonb);
