/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Миграция содержимого страницы коллекции.
 */

import type { Block, PageData } from "./types";

/**
 * 082+ page-collection: collection detail pages (`/c/[slug]`) are now Puck-
 * managed via a single template `page-collection` that auto-scopes to the
 * Astro `params.slug` at render time. This migration seeds the default
 * [Header, Hero('{{COLLECTION_NAME}}'), Catalog (auto-scope), Footer] when
 * absent.
 *
 * Header/Footer are copied from the home page if present so chrome stays in
 * sync. Hero/Catalog use template variables ({{COLLECTION_NAME}},
 * {{COLLECTION_DESCRIPTION}}, {{COLLECTION_IMAGE}}) that the build pipeline
 * substitutes per-collection at render time.
 *
 * Idempotent: if `page-collection` already exists, returns pagesData unchanged.
 */
export function migrateCollectionPage(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  if (pagesData["page-collection"]) return pagesData;

  // Use home page header/footer as templates if available so chrome matches.
  const home = pagesData["home"] as PageData | undefined;
  const homeContent: Block[] = Array.isArray(home?.content)
    ? (home!.content as Block[])
    : [];
  const headerBlock = homeContent.find((b) => b?.type === "Header");
  const footerBlock = homeContent.find((b) => b?.type === "Footer");
  // b45-fix: детерминированные id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json (`Header-collection`,
  // `Catalog-collection`, `Footer-collection`); `Hero-collection` — тем же
  // приёмом для блока без аналога в theme.json.

  const collectionContent: Block[] = [
    headerBlock ?? { type: "Header", props: { id: "Header-collection" } },
    {
      type: "Hero",
      props: {
        id: "Hero-collection",
        variant: "split",
        heading: { text: "{{COLLECTION_NAME}}", size: "large" },
        subtitle: { content: "{{COLLECTION_DESCRIPTION}}", size: "medium" },
        backgroundImage: "{{COLLECTION_IMAGE}}",
        padding: { top: 80, bottom: 80 },
      } as Record<string, unknown>,
    },
    {
      type: "Catalog",
      props: {
        id: "Catalog-collection",
        // collectionSlug omitted → live page auto-scopes from Astro.params.slug
        cards: 24,
        columns: 3,
        showFilter: "true",
        filterPosition: "side",
        showSort: "true",
        colorScheme: "scheme-2",
        padding: { top: 40, bottom: 80 },
      } as Record<string, unknown>,
    },
    footerBlock ?? { type: "Footer", props: { id: "Footer-collection" } },
  ];

  return {
    ...pagesData,
    "page-collection": {
      content: collectionContent,
      root: { props: { meta: { title: "{{COLLECTION_NAME}}" } } },
      zones: {},
    } as PageData,
  };
}
