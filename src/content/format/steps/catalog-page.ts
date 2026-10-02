/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Миграция содержимого страницы каталога.
 */

import type { Block, PageData } from "./types";
import { getHomeChrome, ensureChrome } from "./shared-chrome";

/**
 * 078 phase 4: catalog page is now a Puck-managed page (like home) using a
 * single Catalog block (filter sidebar + grid + pagination). Existing sites
 * have catalog page seeded as [Header, PopularProducts, Footer] from the old
 * createCatalogPageData seed. This migration:
 *
 *   - Adds a default page-catalog with a Catalog block when missing entirely.
 *   - Replaces a legacy PopularProducts on page-catalog with a Catalog block,
 *     BUT only when the page is the exact legacy seed
 *     `[Header, PopularProducts, Footer]`. Once the user has added other
 *     blocks (Hero/PromoBanner/Collections/Gallery/...), they are treated
 *     as having opted out of the auto Catalog widget and the page is left
 *     alone — this allows replicating reference catalog layouts (082).
 *
 * Idempotent: page-catalog already containing a Catalog block is left alone.
 */
export function migrateCatalogPage(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  const existing = pagesData["page-catalog"] as PageData | undefined;
  // b45-fix: детерминированный id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json (`Catalog-1`).
  // New default seed (082+): explicit cards/columns/filter/sort props so the
  // legacy [Header, PopularProducts, Footer] migration produces a Catalog
  // widget with the canonical 12 cards × 3 columns side-filter layout. Legacy
  // aliases (showCollectionFilter, showSidebar) are dropped — Catalog.astro
  // and live catalog.astro accept both shapes.
  const catalogBlock: Block = {
    type: "Catalog",
    props: {
      id: "Catalog-1",
      collectionSlug: undefined,
      cards: 12,
      columns: 3,
      showFilter: "true",
      filterPosition: "side",
      showSort: "true",
      colorScheme: "scheme-2",
      padding: { top: 80, bottom: 80 },
    } as Record<string, unknown>,
  };

  if (!existing || !Array.isArray(existing.content)) {
    const chrome = getHomeChrome(pagesData);
    return {
      ...pagesData,
      "page-catalog": {
        content: [chrome.headerBlock, catalogBlock, chrome.footerBlock],
        root: { props: { title: "Коллекции" } },
        zones: {},
      } as PageData,
    };
  }

  const hasCatalog = existing.content.some((b) => b?.type === "Catalog");
  if (hasCatalog) {
    // 094: patch chrome on already-seeded pages that lack Header/Footer
    // (pre-094 sites where [Catalog]-only was seeded by the broken migration).
    const patched = ensureChrome(existing.content, pagesData);
    if (patched.length === existing.content.length) return pagesData;
    return { ...pagesData, "page-catalog": { ...existing, content: patched } };
  }

  // Only migrate the exact legacy seed [Header, PopularProducts, Footer]. If
  // the user has customised the page with additional blocks, leave it alone
  // (082 catalog reference layout uses Hero+Collections+PopularProducts+
  // Gallery without the functional Catalog widget).
  const types = existing.content
    .map((b) => b?.type)
    .filter(Boolean) as string[];
  const isLegacySeed =
    types.length === 3 &&
    types[0] === "Header" &&
    types[1] === "PopularProducts" &&
    types[2] === "Footer";
  if (!isLegacySeed) return pagesData;

  const popularIdx = existing.content.findIndex(
    (b) => b?.type === "PopularProducts",
  );
  const nextContent = [...existing.content];
  nextContent[popularIdx] = catalogBlock;

  return {
    ...pagesData,
    "page-catalog": { ...existing, content: nextContent },
  };
}
