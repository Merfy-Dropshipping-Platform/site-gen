/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Общий хром (Header/Footer главной) — используется мигратором корзины,
 * каталога, товара и сидерами страниц аккаунта (profile/wishlist/account/login).
 */

import type { Block, PageData } from "./types";

/**
 * 094: shared chrome helper. Returns Header/Footer blocks lifted from the
 * home page so all auto-seeded pages (catalog/product/cart/checkout/collection)
 * stay visually consistent with the merchant's home layout. Falls back to
 * minimal placeholder blocks if home lacks chrome (e.g. user removed it).
 *
 * IMPORTANT: returns the home blocks AS-IS (same object refs) — same pattern
 * used by `migrateCollectionPage`. This keeps the data shape predictable;
 * downstream code that deep-clones per page is responsible for unique IDs.
 */
export function getHomeChrome(pagesData: Record<string, unknown>): {
  headerBlock: Block;
  footerBlock: Block;
} {
  const home = pagesData["home"] as PageData | undefined;
  const homeContent: Block[] = Array.isArray(home?.content)
    ? (home!.content as Block[])
    : [];
  // b45-fix: ids детерминированы (не Date.now()) — эта функция запускается
  // read-time на КАЖДЫЙ GET без персиста (см. PreviewController.loadRevisionData).
  // Конструктор загружает данные редактора и iframe грузит /preview ДВУМЯ
  // отдельными HTTP-запросами; Date.now()-id на каждом из них давал РАЗНЫЙ id
  // для одного и того же блока → update-block/postMessage бил мимо DOM
  // (querySelector не находил узел, правка терялась молча). Детерминированный
  // id стабилен на любое число независимых вызовов над одними и теми же
  // неперсистентными данными.
  return {
    headerBlock: homeContent.find((b) => b?.type === "Header") ?? {
      type: "Header",
      props: { id: "Header-fallback" },
    },
    footerBlock: homeContent.find((b) => b?.type === "Footer") ?? {
      type: "Footer",
      props: { id: "Footer-fallback" },
    },
  };
}

/**
 * 094: patches a content array so it starts with Header and ends with Footer.
 * If Header/Footer already exists ANYWHERE in content, leaves it (avoids
 * accidentally duplicating chrome when blocks are mid-array for non-standard
 * layouts). Used by migrate{Catalog,Product,Cart}Page to backfill existing
 * sites that were seeded without chrome (pre-094 bug).
 *
 * Idempotent: re-running on already-chromed content is a no-op (same length).
 */
export function ensureChrome(
  content: Block[],
  pagesData: Record<string, unknown>,
): Block[] {
  const chrome = getHomeChrome(pagesData);
  const out = [...content];
  const hasHeader = out.some((b) => b?.type === "Header");
  const hasFooter = out.some((b) => b?.type === "Footer");
  if (!hasHeader) out.unshift(chrome.headerBlock);
  if (!hasFooter) out.push(chrome.footerBlock);
  return out;
}
