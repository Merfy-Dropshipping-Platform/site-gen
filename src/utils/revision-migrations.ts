/**
 * Server-side revision migrations.
 *
 * Applied at read time (getRevision, build pipeline) so legacy revision
 * shapes converge to the current canonical structure without backfills.
 *
 * All migrations MUST be idempotent — running twice produces identical
 * output. New shapes must be detected by feature presence (e.g. "has Catalog
 * block in page-catalog content"), not by version number.
 */

type Block = { type?: string; props?: Record<string, unknown> };
type PageData = { content?: Block[]; root?: { props?: Record<string, unknown> }; zones?: Record<string, unknown> };

/**
 * 078 phase 4: catalog page is now a Puck-managed page (like home) using a
 * single Catalog block (filter sidebar + grid + pagination). Existing sites
 * have catalog page seeded as [Header, PopularProducts, Footer] from the old
 * createCatalogPageData seed. This migration:
 *
 *   - Adds a default page-catalog with a Catalog block when missing entirely.
 *   - Replaces a legacy PopularProducts on page-catalog with a Catalog block
 *     (preserves Header/Footer chrome and any user-added blocks).
 *   - Inserts a Catalog block before Footer when no Catalog/PopularProducts.
 *
 * Idempotent: page-catalog already containing a Catalog block is left alone.
 */
function migrateCatalogPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  const existing = pagesData['page-catalog'] as PageData | undefined;
  const ts = Date.now();
  const catalogBlock: Block = {
    type: 'Catalog',
    props: {
      id: `Catalog-${ts}`,
      showCollectionFilter: 'true',
      showSidebar: 'true',
      colorScheme: 'scheme-1',
      padding: { top: 40, bottom: 80 },
    } as Record<string, unknown>,
  };

  if (!existing || !Array.isArray(existing.content)) {
    return {
      ...pagesData,
      'page-catalog': {
        content: [catalogBlock],
        root: { props: { title: 'Коллекции' } },
        zones: {},
      } as PageData,
    };
  }

  const hasCatalog = existing.content.some((b) => b?.type === 'Catalog');
  if (hasCatalog) return pagesData;

  const popularIdx = existing.content.findIndex((b) => b?.type === 'PopularProducts');
  let nextContent: Block[];
  if (popularIdx >= 0) {
    nextContent = [...existing.content];
    nextContent[popularIdx] = catalogBlock;
  } else {
    const footerIdx = existing.content.findIndex((b) => b?.type === 'Footer');
    nextContent = [...existing.content];
    if (footerIdx >= 0) {
      nextContent.splice(footerIdx, 0, catalogBlock);
    } else {
      nextContent.push(catalogBlock);
    }
  }

  return {
    ...pagesData,
    'page-catalog': { ...existing, content: nextContent },
  };
}

/**
 * Apply all server-side migrations to a revision data object. Mutates a
 * shallow copy — input is not modified.
 */
export function migrateRevisionData(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, unknown> = { ...data };
  const pagesData = out.pagesData;
  if (pagesData && typeof pagesData === 'object') {
    out.pagesData = migrateCatalogPage(pagesData as Record<string, unknown>);
  }
  return out;
}
