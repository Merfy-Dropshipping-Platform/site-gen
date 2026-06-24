import {
  PAGE_REGISTRY,
  VERBATIM_PREFIXES,
  isVerbatimRoute,
  getContentPages,
  getSystemPageRoute,
  getRouteMap,
  getChromeKind,
} from '../page-registry';

/**
 * Spec 108 T004 — parity-snapshot реестра страниц.
 *
 * Захардкоженные ожидаемые значения СНЯТЫ из реального текущего кода (на момент
 * Foundational-фазы), чтобы доказать «поведение не изменилось»:
 *
 *  - V2_COMPLEX_ROUTE_PREFIXES  — src/themes/v2-routes.ts:8-23
 *  - CONTENT_PAGES[]            — src/themes/v2-live-pages.ts:27-58
 *                                (+ requireOwnShell из composeContentPagesIntoDist:99-103)
 *  - SYSTEM_PAGE_ROUTES         — src/controllers/preview.controller.ts:38-48
 *
 * Если этот тест падает после правки реестра — расхождение с прежним поведением.
 */

// ── Снимки из реального кода (НЕ из реестра — независимый эталон) ──────────

/** v2-routes.ts:8-23 — V2_COMPLEX_ROUTE_PREFIXES (состав; Set без порядка). */
const SNAP_V2_COMPLEX_ROUTE_PREFIXES = new Set([
  'product',
  'products',
  'cart',
  'checkout',
  'auth',
  'blog',
  'legal',
  'account',
  'design-system',
  'puck-editor',
]);

/**
 * v2-live-pages.ts:27-58 (CONTENT_PAGES) + composeContentPagesIntoDist:99-103
 * (requireOwnShell вычислялся отдельно как key === 'page-catalog' ||
 * key === 'page-collection'). Порядок ВАЖЕН (массив).
 */
const SNAP_CONTENT_PAGES: Array<{
  key: string;
  route: string;
  requireOwnShell?: boolean;
  collectionContext?: { name?: string; description?: string; image?: string };
}> = [
  { key: 'home', route: '' },
  { key: 'page-about', route: 'about' },
  { key: 'page-contacts', route: 'contacts' },
  { key: 'page-delivery', route: 'delivery' },
  { key: 'page-catalog', route: 'catalog', requireOwnShell: true },
  {
    key: 'page-collection',
    route: 'collections/preview',
    requireOwnShell: true,
    collectionContext: {},
  },
  { key: 'page-checkout-result', route: 'checkout-result' },
];

/** preview.controller.ts:38-48 — SYSTEM_PAGE_ROUTES (id → route). */
const SNAP_SYSTEM_PAGE_ROUTES: Record<string, string> = {
  home: '',
  'page-about': 'about',
  'page-contacts': 'contacts',
  'page-catalog': 'catalog',
  'page-collection': 'collections/preview',
  'page-cart': 'cart',
  'page-product': 'product',
  'page-checkout': 'checkout',
  'page-checkout-result': 'checkout-result',
};

describe('page-registry parity-snapshot', () => {
  describe('isVerbatimRoute ≡ V2_COMPLEX_ROUTE_PREFIXES / isV2ComplexRoute', () => {
    it('классифицирует каждый префикс из снимка как verbatim', () => {
      for (const prefix of SNAP_V2_COMPLEX_ROUTE_PREFIXES) {
        expect(isVerbatimRoute(prefix)).toBe(true);
      }
    });

    it('первый сегмент решает (как route.split("/")[0])', () => {
      // Прежний isV2ComplexRoute смотрел только первый сегмент.
      expect(isVerbatimRoute('product/some-slug')).toBe(true);
      expect(isVerbatimRoute('legal/privacy')).toBe(true);
      expect(isVerbatimRoute('checkout/step-2')).toBe(true);
    });

    it('content-маршруты НЕ verbatim (как прежде)', () => {
      // home + контентные системные страницы — не в наборе.
      for (const route of ['', 'about', 'contacts', 'delivery', 'catalog', 'collections/preview', 'checkout-result']) {
        expect(isVerbatimRoute(route)).toBe(false);
      }
    });

    it('множество verbatim-первосегментов реестра ТОЧНО равно снимку', () => {
      // Полное множество = verbatim-записи реестра + VERBATIM_PREFIXES.
      const fromRegistry = new Set<string>([
        ...PAGE_REGISTRY.filter((e) => e.kind === 'verbatim').map((e) => e.route.split('/')[0]),
        ...VERBATIM_PREFIXES,
      ]);
      expect([...fromRegistry].sort()).toEqual([...SNAP_V2_COMPLEX_ROUTE_PREFIXES].sort());
    });

    it('не относит к verbatim несуществующие префиксы', () => {
      expect(isVerbatimRoute('about-us')).toBe(false);
      expect(isVerbatimRoute('random')).toBe(false);
    });
  });

  describe('getContentPages() ≡ CONTENT_PAGES[]', () => {
    it('даёт побайтно эквивалентный список (состав, порядок, requireOwnShell, collectionContext)', () => {
      expect(getContentPages()).toEqual(SNAP_CONTENT_PAGES);
    });

    it('сохраняет порядок home → about → contacts → delivery → catalog → collection → checkout-result', () => {
      expect(getContentPages().map((p) => p.key)).toEqual([
        'home',
        'page-about',
        'page-contacts',
        'page-delivery',
        'page-catalog',
        'page-collection',
        'page-checkout-result',
      ]);
    });

    it('requireOwnShell=true только у catalog и collection', () => {
      const own = getContentPages().filter((p) => p.requireOwnShell === true).map((p) => p.key);
      expect(own.sort()).toEqual(['page-catalog', 'page-collection']);
    });

    it('collectionContext={} только у page-collection', () => {
      const withCtx = getContentPages().filter((p) => p.collectionContext !== undefined);
      expect(withCtx).toHaveLength(1);
      expect(withCtx[0].key).toBe('page-collection');
      expect(withCtx[0].collectionContext).toEqual({});
    });
  });

  describe('getRouteMap() / getSystemPageRoute() ≡ SYSTEM_PAGE_ROUTES', () => {
    it('карта id→route эквивалентна снимку (по составу)', () => {
      expect(getRouteMap()).toEqual(SNAP_SYSTEM_PAGE_ROUTES);
    });

    it('покрывает все 9 системных страниц', () => {
      expect(Object.keys(getRouteMap())).toHaveLength(9);
    });

    it('getSystemPageRoute возвращает тот же route для каждого id', () => {
      for (const [id, route] of Object.entries(SNAP_SYSTEM_PAGE_ROUTES)) {
        expect(getSystemPageRoute(id)).toBe(route);
      }
    });

    it('getSystemPageRoute(unknown) → undefined', () => {
      expect(getSystemPageRoute('page-nonexistent')).toBeUndefined();
    });
  });

  describe('инварианты реестра', () => {
    it('id уникален', () => {
      const ids = PAGE_REGISTRY.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('kind ⇔ isVerbatimRoute(route) согласованы для каждой записи', () => {
      for (const e of PAGE_REGISTRY) {
        expect(isVerbatimRoute(e.route)).toBe(e.kind === 'verbatim');
      }
    });

    it('VERBATIM_PREFIXES не пересекаются с первыми сегментами записей реестра', () => {
      const entrySegments = new Set(PAGE_REGISTRY.map((e) => e.route.split('/')[0]));
      for (const p of VERBATIM_PREFIXES) {
        expect(entrySegments.has(p)).toBe(false);
      }
    });
  });

  describe('getChromeKind', () => {
    it('checkout-маршрут → checkout', () => {
      expect(getChromeKind('checkout')).toBe('checkout');
      expect(getChromeKind('checkout/step-2')).toBe('checkout');
    });

    it('home ("") → none (источник канона, unifyChromeInDist пропускает home)', () => {
      expect(getChromeKind('')).toBe('none');
    });

    it('обычные страницы → full', () => {
      for (const route of ['about', 'contacts', 'delivery', 'catalog', 'cart', 'product', 'checkout-result']) {
        expect(getChromeKind(route)).toBe(route === 'checkout-result' ? 'full' : 'full');
      }
    });

    it('chrome каждой записи реестра согласован с getChromeKind(route)', () => {
      for (const e of PAGE_REGISTRY) {
        expect(getChromeKind(e.route)).toBe(e.chrome);
      }
    });
  });
});
