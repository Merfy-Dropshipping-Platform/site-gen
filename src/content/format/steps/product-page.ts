/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Миграция содержимого страницы товара.
 */

import type { Block, PageData } from './types';
import { getHomeChrome, ensureChrome } from './shared-chrome';

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
export function migrateProductPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  const existing = pagesData['page-product'] as PageData | undefined;
  // b45-fix: детерминированные id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json (`Product-1`,
  // `PopularProducts-product`); `Newsletter-product` — тем же приёмом для
  // блока без аналога в theme.json.
  const productBlock: Block = {
    type: 'Product',
    props: {
      id: 'Product-1',
      productId: '',
      layout: 'two-columns',
      photoPosition: 'left',
      zoomMode: 'hover',
      colorScheme: 'scheme-2',
      padding: { top: 80, bottom: 80 },
    } as Record<string, unknown>,
  };
  const popularBlock: Block = {
    type: 'PopularProducts',
    props: {
      id: 'PopularProducts-product',
      heading: 'Похожие товары',
      cards: 4,
      columns: 4,
      colorScheme: 'scheme-2',
      padding: { top: 60, bottom: 60 },
    } as Record<string, unknown>,
  };
  const newsletterBlock: Block = {
    type: 'Newsletter',
    props: {
      id: 'Newsletter-product',
      colorScheme: 'scheme-2',
      padding: { top: 40, bottom: 40 },
    } as Record<string, unknown>,
  };

  if (!existing || !Array.isArray(existing.content)) {
    const chrome = getHomeChrome(pagesData);
    return {
      ...pagesData,
      'page-product': {
        content: [chrome.headerBlock, productBlock, popularBlock, newsletterBlock, chrome.footerBlock],
        root: { props: { title: 'Товар' } },
        zones: {},
      } as PageData,
    };
  }

  const hasProduct = existing.content.some((b) => b?.type === 'Product');
  if (hasProduct) {
    // 094: patch chrome on already-seeded pages that lack Header/Footer.
    const patched = ensureChrome(existing.content, pagesData);
    if (patched.length === existing.content.length) return pagesData;
    return { ...pagesData, 'page-product': { ...existing, content: patched } };
  }

  // Has page-product but no Product block — insert before Footer or at end.
  const footerIdx = existing.content.findIndex((b) => b?.type === 'Footer');
  const nextContent = [...existing.content];
  if (footerIdx >= 0) {
    nextContent.splice(footerIdx, 0, productBlock);
  } else {
    nextContent.push(productBlock);
  }
  const withChrome = ensureChrome(nextContent, pagesData);
  return {
    ...pagesData,
    'page-product': { ...existing, content: withChrome },
  };
}
