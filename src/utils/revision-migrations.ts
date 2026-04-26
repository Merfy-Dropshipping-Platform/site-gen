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
 * 078 page-product: page-product is now a Puck-managed template like home/
 * catalog. Existing sites may not have page-product in pagesData yet, so seed
 * the canonical default block list. Idempotent: pages already containing a
 * Product block are left untouched.
 *
 * Default seed: [Header, Product, PopularProducts, Newsletter, Footer]
 * (Header/Footer fall back to home page chrome at render time, so we only
 * seed Product/PopularProducts/Newsletter here.)
 */
function migrateProductPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  const existing = pagesData['page-product'] as PageData | undefined;
  const ts = Date.now();
  const productBlock: Block = {
    type: 'Product',
    props: {
      id: `Product-${ts}`,
      productId: '',
      layout: 'two-columns',
      photoPosition: 'left',
      zoomMode: 'hover',
      colorScheme: 'scheme-1',
      padding: { top: 80, bottom: 80 },
    } as Record<string, unknown>,
  };
  const popularBlock: Block = {
    type: 'PopularProducts',
    props: {
      id: `PopularProducts-${ts + 1}`,
      heading: 'Похожие товары',
      cards: 4,
      columns: 4,
      colorScheme: 'scheme-1',
      padding: { top: 60, bottom: 60 },
    } as Record<string, unknown>,
  };
  const newsletterBlock: Block = {
    type: 'Newsletter',
    props: {
      id: `Newsletter-${ts + 2}`,
      colorScheme: 'scheme-1',
      padding: { top: 40, bottom: 40 },
    } as Record<string, unknown>,
  };

  if (!existing || !Array.isArray(existing.content)) {
    return {
      ...pagesData,
      'page-product': {
        content: [productBlock, popularBlock, newsletterBlock],
        root: { props: { title: 'Товар' } },
        zones: {},
      } as PageData,
    };
  }

  const hasProduct = existing.content.some((b) => b?.type === 'Product');
  if (hasProduct) return pagesData;

  // Has page-product but no Product block — insert before Footer or at end.
  const footerIdx = existing.content.findIndex((b) => b?.type === 'Footer');
  const nextContent = [...existing.content];
  if (footerIdx >= 0) {
    nextContent.splice(footerIdx, 0, productBlock);
  } else {
    nextContent.push(productBlock);
  }
  return {
    ...pagesData,
    'page-product': { ...existing, content: nextContent },
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
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateProductPage(out.pagesData as Record<string, unknown>);
  }
  return out;
}
