/**
 * Spec 108 — Единый реестр системных страниц платформы.
 *
 * Единственный источник правды о системных страницах (заменяет три
 * разрозненных определения: `V2_COMPLEX_ROUTE_PREFIXES` в v2-routes.ts,
 * `CONTENT_PAGES[]` в v2-live-pages.ts, `SYSTEM_PAGE_ROUTES` в
 * preview.controller.ts). Чистый модуль: только данные + функции-проекции,
 * без I/O и побочных эффектов.
 *
 * Foundational-фаза (T003): модуль создан, НО ещё нигде не импортируется —
 * проводка потребителей (ре-экспорты/правка импортов) — отдельная фаза.
 * Контрактная гарантия этой фазы: проекции `isVerbatimRoute`,
 * `getContentPages()`, `getRouteMap()` дают ТОЧНО те же значения, что
 * прежние списки (доказывается parity-snapshot тестом T004).
 */

export type PageKind = 'content' | 'verbatim';
export type ChromeKind = 'full' | 'checkout' | 'none';

export interface PageEntry {
  /** Канонический id страницы ревизии ('home' | 'page-about' | ...). Уникален. */
  id: string;
  /** Live/preview маршрут. '' = home. Первый сегмент определяет verbatim. */
  route: string;
  kind: PageKind;
  chrome: ChromeKind;
  /**
   * Если true — пересаживается только при наличии своего шелла в дисте;
   * иначе фолбэк на home-шелл (как about/contacts/delivery). Для catalog и
   * collections/preview = true (см. composeContentPagesIntoDist:99-103).
   */
  requireOwnShell?: boolean;
  /** Контекст подстановки {{COLLECTION_*}} для шаблона коллекции. */
  collectionContext?: { name?: string; description?: string; image?: string };
  /**
   * Входит ли страница в id→route карту preview-фолбэка (getRouteMap /
   * getSystemPageRoute). По умолчанию true. Установлено false для page-delivery:
   * прежний SYSTEM_PAGE_ROUTES (preview.controller.ts:38-48) НЕ содержал
   * delivery, тогда как CONTENT_PAGES (v2-live-pages.ts) — содержал. Реестр —
   * объединение обоих списков; флаг сохраняет обе проекции точь-в-точь (parity).
   */
  inRouteMap?: boolean;
}

/**
 * Реестр системных страниц (единственный источник). Покрывает все 9
 * системных страниц текущего SYSTEM_PAGE_ROUTES.
 *
 * kind ⇔ isVerbatimRoute(route) согласованы по построению: verbatim-записи
 * (cart/product/checkout) имеют route, чей первый сегмент входит в множество
 * verbatim-префиксов; content-записи — нет. Verbatim-маршруты БЕЗ собственной
 * страницы-id (products/auth/blog/legal/account/design-system/puck-editor)
 * вынесены в плоский VERBATIM_PREFIXES, чтобы isVerbatimRoute сохранил
 * поведение точь-в-точь.
 *
 * Порядок content-записей здесь = порядок прежнего CONTENT_PAGES[]
 * (getContentPages() сохраняет его — важно для parity).
 */
export const PAGE_REGISTRY: readonly PageEntry[] = [
  // ── Контентные системные страницы (порядок = CONTENT_PAGES[]) ───────────
  { id: 'home', route: '', kind: 'content', chrome: 'none' },
  { id: 'page-about', route: 'about', kind: 'content', chrome: 'full' },
  { id: 'page-contacts', route: 'contacts', kind: 'content', chrome: 'full' },
  // delivery есть в CONTENT_PAGES, но НЕ в SYSTEM_PAGE_ROUTES → inRouteMap:false.
  { id: 'page-delivery', route: 'delivery', kind: 'content', chrome: 'full', inRouteMap: false },
  {
    id: 'page-catalog',
    route: 'catalog',
    kind: 'content',
    chrome: 'full',
    requireOwnShell: true,
  },
  {
    id: 'page-collection',
    route: 'collections/preview',
    kind: 'content',
    chrome: 'full',
    requireOwnShell: true,
    collectionContext: {},
  },
  {
    id: 'page-checkout-result',
    route: 'checkout-result',
    kind: 'content',
    chrome: 'full',
  },
  // page-cart — composable (kind:content): корзина = секция CartSection +
  // мерчант добавляет другие секции, как на главной. Дефолт [CartSection]
  // приходит из packages/theme-rose/pages/cart.json через lazy-seed (без
  // миграции ревизий существующих сайтов). Шелл — cart.astro (Layout).
  { id: 'page-cart', route: 'cart', kind: 'content', chrome: 'full' },
  // ── Verbatim системные страницы (есть id в SYSTEM_PAGE_ROUTES) ──────────
  { id: 'page-product', route: 'product', kind: 'verbatim', chrome: 'full' },
  {
    id: 'page-checkout',
    route: 'checkout',
    kind: 'verbatim',
    chrome: 'checkout',
  },
];

/**
 * Темы, чья ВЫДЕЛЕННАЯ страница товара (/product) рендерится единым theme-base
 * блоком `Product` (как контентная секция через renderBlock/composeV2Page —
 * настройки секции запекаются в SSR), а НЕ verbatim-портом темы
 * (RoseProductDetail.astro и аналоги). Rose-first раскатка унификации PDP:
 * расширять множество по мере верификации каждой темы. Откат темы = убрать её
 * отсюда (страница снова берётся verbatim из dist). Гейт читают
 * `composeContentPagesIntoDist` (универсальный /product) и build.service
 * (per-slug /product/<slug>).
 */
export const PRODUCT_UNIFIED_THEMES: ReadonlySet<string> = new Set<string>(['rose', 'vanilla', 'bloom', 'flux', 'satin']);

/**
 * Темы, чья страница корзины (/cart) рендерится Puck-блоками
 * CartBody / CartSummary / CartTotals / CartCheckoutButton (spec 110),
 * а не verbatim-портом `themes/<t>/src/pages/cart.astro`.
 * Иначе настройки секций корзины в конструкторе мёртвые: превью отдаёт
 * статичный blob, блоков с data-puck-component-id нет.
 * Rose-first + flux (текущий слой паритета). Откат темы = убрать её отсюда.
 * vanilla добавлена 2026-09-09: все четыре блока рендерятся (проверено
 * `/preview/block`), собственный шелл `dist/cart/index.html` есть.
 * bloom добавлен 2026-09-09 по той же проверке: без него страница корзины в
 * конструкторе отдавалась статичным blob'ом — секции «Корзина»/«Промежуточный
 * итог»/«Итоговая цена»/«Кнопка оформления» в дереве были, а клик по превью не
 * открывал панель (кликать не по чему: узлов с data-puck-component-id нет).
 * satin добавлен 2026-09-10 по той же проверке: `packages/theme-satin/pages/cart.json`
 * уже собран из CartBody/CartSummary/CartTotals/CartCheckoutButton, все четыре
 * блока рендерятся через `/preview/block`. Без гейта satin оставался на legacy
 * CartSection — отсюда «Корзина (устар.)» в дереве и настройки товара вместо
 * настроек корзины в панели (баг-репорт владельца).
 */
export const CART_UNIFIED_THEMES: ReadonlySet<string> = new Set<string>(['rose', 'flux', 'vanilla', 'bloom', 'satin']);

/**
 * Темы с composable page-cart (CartSection + мерчантские секции), зеркало
 * PRODUCT_UNIFIED_THEMES. Тема вне множества → verbatim cart.astro.
 */
export const CART_SECTION_THEMES: ReadonlySet<string> = new Set<string>([
  'rose',
  'vanilla',
  'bloom',
  'satin',
  'flux',
]);

/**
 * Плоские verbatim-префиксы без собственной страницы-id (маршруты-исключения,
 * не «системные страницы»). Вместе с verbatim-записями реестра дают полное
 * множество прежнего V2_COMPLEX_ROUTE_PREFIXES.
 */
export const VERBATIM_PREFIXES: ReadonlySet<string> = new Set([
  'products',
  'auth',
  'blog',
  'legal',
  'account',
  'design-system',
  'puck-editor',
]);

/** Первые сегменты всех verbatim-маршрутов (из записей реестра + плоский список). */
const VERBATIM_FIRST_SEGMENTS: ReadonlySet<string> = new Set<string>([
  ...PAGE_REGISTRY.filter((e) => e.kind === 'verbatim').map(
    (e) => e.route.split('/')[0],
  ),
  ...VERBATIM_PREFIXES,
]);

/**
 * Verbatim ли маршрут (по первому сегменту). Заменяет isV2ComplexRoute.
 * Пустой маршрут (home) — контентный.
 */
export function isVerbatimRoute(route: string): boolean {
  return VERBATIM_FIRST_SEGMENTS.has(route.split('/')[0]);
}

/**
 * Контентные системные страницы для пересадки на live. Заменяет CONTENT_PAGES[]
 * + вычисление requireOwnShell в composeContentPagesIntoDist. Сохраняет порядок
 * записей реестра (= порядок прежнего CONTENT_PAGES[]).
 */
export function getContentPages(): Array<{
  key: string;
  route: string;
  requireOwnShell?: boolean;
  collectionContext?: { name?: string; description?: string; image?: string };
}> {
  return PAGE_REGISTRY.filter((e) => e.kind === 'content').map((e) => ({
    key: e.id,
    route: e.route,
    ...(e.requireOwnShell !== undefined ? { requireOwnShell: e.requireOwnShell } : {}),
    ...(e.collectionContext !== undefined ? { collectionContext: e.collectionContext } : {}),
  }));
}

/**
 * id → route фолбэк. Заменяет SYSTEM_PAGE_ROUTES (по одному id). Учитывает
 * inRouteMap: страницы с inRouteMap===false (page-delivery) не входят в карту
 * (их не было в прежнем SYSTEM_PAGE_ROUTES) → undefined.
 */
export function getSystemPageRoute(id: string): string | undefined {
  const entry = PAGE_REGISTRY.find((e) => e.id === id && e.inRouteMap !== false);
  return entry?.route;
}

/**
 * id → route карта целиком. Заменяет SYSTEM_PAGE_ROUTES — только записи с
 * inRouteMap !== false (page-delivery исключён для parity с прежним списком).
 */
export function getRouteMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of PAGE_REGISTRY) {
    if (e.inRouteMap === false) continue;
    map[e.id] = e.route;
  }
  return map;
}

/**
 * Тип хрома для маршрута (full|checkout|none). Маршрут checkout → 'checkout',
 * home ('') → 'none', остальное → 'full'. Зеркало unifyChromeInDist:
 * home — источник канона (не подменяется), checkout — CheckoutHeader,
 * прочее — обычный Header.
 */
export function getChromeKind(route: string): ChromeKind {
  const entry = PAGE_REGISTRY.find((e) => e.route === route);
  if (entry) return entry.chrome;
  if (route.split('/')[0] === 'checkout') return 'checkout';
  if (route === '') return 'none';
  return 'full';
}
