/**
 * R4: таблица шагов миграции ревизии — данные, а не лестница `if`.
 *
 * Раньше `migrateRevisionData` была ~120-строчной лестницей из ~22 почти
 * одинаковых блоков `if (out.pagesData && typeof … === 'object') out.pagesData
 * = step(…)` плюс сидеры страниц и унификация шапки/подвала. Порядок шагов
 * несёт СМЫСЛ (несколько шагов обязаны идти строго после других — раньше это
 * жило только в комментариях), но лестница сама по себе этот порядок не
 * проверяла: переставь блоки местами — TypeScript и тесты промолчат.
 *
 * Здесь порядок — те же шаги, в том же порядке, что были в лестнице (R4 не
 * меняет поведение, `migrateRevisionData` возвращает то же самое на тех же
 * входах — золотые документы это проверяют), но ограничения порядка (`after`)
 * записаны как данные и проверяются `validateStepOrder()` — см. тест
 * `__tests__/table.spec.ts`.
 */
import type { Block, PageData } from './types';
import { migrateCartPage } from './cart-page';
import { migrateCatalogPage } from './catalog-page';
import { migrateCollectionPage } from './collection-page';
import { migrateContentPages } from './content-pages';
import { migrateProductPage } from './product-page';
import {
  migrateCheckoutPage,
  retagSeededCheckoutScheme,
  seedCheckoutResultPage,
  themeHasCheckoutResultPage,
} from './checkout';
import { normalizeFooterContacts, stripThemeNameFromFooter } from './footer-contacts';
import { normalizePromoBannerPadding, renameNewsletterPlaceholder } from './promo-newsletter';
import { dropSeededCartScheme, dropSeededCounterVariant } from './cart-scheme-counter';
import {
  materializeGalleryItems,
  materializeMultiRowsItemSize,
  materializeMultiRowsSectionSize,
} from './multirows-gallery';
import { clearDemoImageSections } from './demo-images';
import {
  backfillHeroLegacyProps,
  backfillMainTextLegacyButton,
  backfillProductVariants,
  backfillVideoSizeSplit,
} from './legacy-backfills';
import {
  seedAccountPageSections,
  seedLoginPageSection,
  seedProfilePage,
  seedWishlistPage,
} from './account-pages';
import { storeChromeOnCheckoutResult, unifyFooterWithHome, unifyHeaderWithHome } from './chrome-unify';

/** Что шагу нужно сверх самого документа — те же параметры, что были у `migrateRevisionData`. */
export type MigrationCtx = {
  themeId: string | null | undefined;
  siteName: string | null | undefined;
  /** Пункт 3б (PARITY_FOOTER): подвал = подвал главной. Решает вызывающий. */
  unifyFooter: boolean;
};

type StepCommon = {
  name: string;
  /** Только эти шаги видны в списке порядка — должны идти строго после них. */
  after?: readonly string[];
  /** Не задано — шаг всегда включён (как раньше, безусловный вызов в лестнице). */
  when?: (ctx: MigrationCtx) => boolean;
};

/** Оперирует `document.pagesData` — под стандартным гардом «есть и объект» (как в лестнице). */
export type PagesDataStep = StepCommon & {
  scope: 'pagesData';
  run: (pagesData: Record<string, unknown>, ctx: MigrationCtx) => Record<string, unknown>;
};

/** Оперирует ВСЕМ документом (`pages[]` + `pagesData` разом) — сидеры системных страниц. */
export type DocumentStep = StepCommon & {
  scope: 'document';
  run: (doc: Record<string, unknown>, ctx: MigrationCtx) => Record<string, unknown>;
};

export type MigrationStep = PagesDataStep | DocumentStep;

// ── Фаза 1: миграции и бэкфиллы pagesData (было — первые ~21 блок лестницы) ──
export const PAGESDATA_MIGRATION_STEPS: readonly PagesDataStep[] = [
  { name: 'migrateCatalogPage', scope: 'pagesData', run: (pd) => migrateCatalogPage(pd) },
  { name: 'migrateCollectionPage', scope: 'pagesData', run: (pd) => migrateCollectionPage(pd) },
  { name: 'migrateContentPages', scope: 'pagesData', run: (pd) => migrateContentPages(pd) },
  { name: 'migrateProductPage', scope: 'pagesData', run: (pd) => migrateProductPage(pd) },
  { name: 'migrateCartPage', scope: 'pagesData', run: (pd) => migrateCartPage(pd) },
  { name: 'migrateCheckoutPage', scope: 'pagesData', run: (pd) => migrateCheckoutPage(pd) },
  { name: 'retagSeededCheckoutScheme', scope: 'pagesData', run: (pd) => retagSeededCheckoutScheme(pd) },
  { name: 'normalizeFooterContacts', scope: 'pagesData', run: (pd) => normalizeFooterContacts(pd) },
  {
    name: 'stripThemeNameFromFooter',
    scope: 'pagesData',
    run: (pd, ctx) => stripThemeNameFromFooter(pd, ctx.themeId, ctx.siteName),
  },
  { name: 'normalizePromoBannerPadding', scope: 'pagesData', run: (pd) => normalizePromoBannerPadding(pd) },
  { name: 'renameNewsletterPlaceholder', scope: 'pagesData', run: (pd) => renameNewsletterPlaceholder(pd) },
  {
    name: 'dropSeededCartScheme',
    scope: 'pagesData',
    run: (pd, ctx) => dropSeededCartScheme(pd, ctx.themeId),
  },
  { name: 'dropSeededCounterVariant', scope: 'pagesData', run: (pd) => dropSeededCounterVariant(pd) },
  { name: 'materializeMultiRowsItemSize', scope: 'pagesData', run: (pd) => materializeMultiRowsItemSize(pd) },
  {
    // СТРОГО после materializeMultiRowsItemSize: та читает секционный размер
    // как фолбэк для рядов со снятым «Как в секции», и ей нужно исходное
    // состояние пропа, а не проставленное здесь (комментарий из лестницы).
    name: 'materializeMultiRowsSectionSize',
    scope: 'pagesData',
    after: ['materializeMultiRowsItemSize'],
    run: (pd) => materializeMultiRowsSectionSize(pd),
  },
  { name: 'clearDemoImageSections', scope: 'pagesData', run: (pd) => clearDemoImageSections(pd) },
  {
    // СТРОГО после clearDemoImageSections: стриппер снимает демо-плитки сида,
    // и без материализации секция уезжала бы к мерчанту пустой (комментарий
    // из лестницы).
    name: 'materializeGalleryItems',
    scope: 'pagesData',
    after: ['clearDemoImageSections'],
    run: (pd) => materializeGalleryItems(pd),
  },
  { name: 'backfillProductVariants', scope: 'pagesData', run: (pd) => backfillProductVariants(pd) },
  { name: 'backfillHeroLegacyProps', scope: 'pagesData', run: (pd) => backfillHeroLegacyProps(pd) },
  { name: 'backfillMainTextLegacyButton', scope: 'pagesData', run: (pd) => backfillMainTextLegacyButton(pd) },
  { name: 'backfillVideoSizeSplit', scope: 'pagesData', run: (pd) => backfillVideoSizeSplit(pd) },
];

const PAGESDATA_STEP_NAMES = PAGESDATA_MIGRATION_STEPS.map((s) => s.name);

// ── Фаза 2: сидеры системных страниц (весь документ: pages[] + pagesData) ──
export const DOCUMENT_SEEDER_STEPS: readonly DocumentStep[] = [
  {
    // Spec 103/109: оперирует ПОЛНОЙ ревизией (touches pages[] + pagesData),
    // поэтому после ВСЕХ pagesData-мигр��ций/бэкфиллов фазы 1 (комментарий из
    // лестницы: «после pagesData-сидеров»). Решает по манифесту темы, не по
    // имени.
    name: 'seedCheckoutResultPage',
    scope: 'document',
    after: PAGESDATA_STEP_NAMES,
    when: (ctx) => themeHasCheckoutResultPage(ctx.themeId),
    run: (doc) => seedCheckoutResultPage(doc),
  },
  { name: 'seedProfilePage', scope: 'document', run: (doc) => seedProfilePage(doc) },
  { name: 'seedWishlistPage', scope: 'document', run: (doc) => seedWishlistPage(doc) },
  {
    // СТРОГО после seedProfilePage — тот создаёт page-profile новым сайтам, а
    // этот кладёт в неё секцию, в том числе тем, у кого страница уже была
    // создана пустой (комментарий из лестницы).
    name: 'seedAccountPageSections',
    scope: 'document',
    after: ['seedProfilePage'],
    run: (doc) => seedAccountPageSections(doc),
  },
  { name: 'seedLoginPageSection', scope: 'document', run: (doc) => seedLoginPageSection(doc) },
];

const DOCUMENT_STEP_NAMES = DOCUMENT_SEEDER_STEPS.map((s) => s.name);

// ── Фаза 3: унификация хрома со страницей `home` — САМАЯ ПОСЛЕДНЯЯ ──
export const FINAL_CHROME_STEPS: readonly PagesDataStep[] = [
  {
    // САМОЙ ПОСЛЕДНЕЙ (после фазы 1 И фазы 2): все сидеры выше уже создали
    // свои страницы (catalog/product/cart/checkout/collection/checkout-
    // result/profile/wishlist/account/login) — унификация обязана накрыть и
    // их тоже (комментарий из лестницы, пункт 13).
    name: 'storeChromeOnCheckoutResult',
    scope: 'pagesData',
    after: [...PAGESDATA_STEP_NAMES, ...DOCUMENT_STEP_NAMES],
    run: (pd) => storeChromeOnCheckoutResult(pd),
  },
  {
    name: 'unifyHeaderWithHome',
    scope: 'pagesData',
    after: ['storeChromeOnCheckoutResult'],
    run: (pd) => unifyHeaderWithHome(pd),
  },
  {
    // Пункт 3б: подвал = подвал главной, только если включено (PARITY_FOOTER,
    // знает siteId вызывающий, не эта таблица).
    name: 'unifyFooterWithHome',
    scope: 'pagesData',
    after: ['unifyHeaderWithHome'],
    when: (ctx) => ctx.unifyFooter,
    run: (pd) => unifyFooterWithHome(pd),
  },
];

/** Полная таблица — порядок исполнения `migrateRevisionData` (см. `../run.ts`). */
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  ...PAGESDATA_MIGRATION_STEPS,
  ...DOCUMENT_SEEDER_STEPS,
  ...FINAL_CHROME_STEPS,
];

/**
 * Самозащита таблицы: для каждого шага с `after` каждое имя из списка обязано
 * встретиться РАНЬШЕ в массиве. Бросает на первое нарушение с именами обоих
 * шагов и их позициями — так саботаж (переставить два шага местами) ловится
 * сразу, а не тихо меняет поведение. Зовётся на загрузке модуля (`run.ts`) И
 * отдельным тестом (`__tests__/table.spec.ts`) — там же саботаж-проверка.
 */
export function validateStepOrder(steps: readonly MigrationStep[]): void {
  const indexOf = new Map(steps.map((s, i) => [s.name, i]));
  steps.forEach((step, i) => {
    for (const dep of step.after ?? []) {
      const depIndex = indexOf.get(dep);
      if (depIndex === undefined) {
        throw new Error(
          `migration step order: "${step.name}" зависит от "${dep}" (after), но такого шага нет в таблице`,
        );
      }
      if (depIndex >= i) {
        throw new Error(
          `migration step order: "${step.name}" (индекс ${i}) должен идти строго после "${dep}" (индекс ${depIndex}), но идёт раньше или одновременно`,
        );
      }
    }
  });
}
