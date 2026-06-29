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
  // ── Verbatim системные страницы (есть id в SYSTEM_PAGE_ROUTES) ──────────
  // page-cart — verbatim ПО УМОЛЧАНИЮ (порт темы cart.astro со всей логикой
  // корзины), НО для тем из CART_SECTION_THEMES рендерится composable —
  // корзина = секция CartSection + мерчант добавляет другие секции, как на
  // главной (зеркало page-product/PRODUCT_UNIFIED_THEMES). Темы без
  // CartSection-порта остаются verbatim, иначе renderBlock('CartSection')
  // упал бы на theme-base-скаффолд «Загрузка корзины».
  { id: 'page-cart', route: 'cart', kind: 'verbatim', chrome: 'full' },
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
 * Темы, чья страница КОРЗИНЫ (/cart) — composable: корзина рендерится Puck-
 * секцией `CartSection` (вся ванильная логика корзины: пусто/наполнено/итог/
 * «Оформить»/cart-store), а мерчант добавляет вокруг другие секции, как на
 * главной. Тема обязана иметь СВОЙ CartSection-порт
 * (themes/<тема>/src/components/sections/CartSection.astro в sections.map.json),
 * иначе renderBlock('CartSection') упадёт на theme-base-скаффолд «Загрузка».
 * Раскатка по темам — расширять множество по мере добавления порта. Тема НЕ в
 * множестве → page-cart остаётся verbatim (cart.astro). Зеркало
 * PRODUCT_UNIFIED_THEMES. Гейт читают `composeContentPagesIntoDist` (live-
 * пересадка) и `preview.controller` (превью-путь: composableCart снимает
 * complex-гейт, как unifiedProduct для товара).
 */
export const CART_SECTION_THEMES: ReadonlySet<string> = new Set<string>(['rose']);

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
