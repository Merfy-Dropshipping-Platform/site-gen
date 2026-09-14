import { getPageResolver } from '../themes/page-resolver-instance';

// Канонический системный набор страниц rose (theme.json `pages[]`).
// Spec 103 добавил `page-checkout-result` (thank-you). Пункт 14 тестировщика
// добавил `page-profile` (личный кабинет покупателя, `/account/profile`) —
// страница витрины существовала и раньше, но записи в манифесте не имела,
// поэтому в верхнем меню конструктора её не было. Держим список в синхроне
// с манифестом — стэйл-счётчик ловит рассинхрон.
const ROSE_SYSTEM_PAGE_IDS = [
  'home',
  'page-about',
  'page-delivery',
  'page-contacts',
  'page-catalog',
  'page-collection',
  'page-cart',
  'page-product',
  'page-checkout',
  'page-checkout-result',
  'page-profile',
  // Страница «Избранное» (/wishlist): витрина была у всех пяти тем, записи
  // страницы не было — секцию «Избранное» негде было настроить.
  'page-wishlist',
];

describe('sites multipage integration', () => {
  it('PageResolver for rose buildInitialRevision returns all system pages', async () => {
    const resolver = getPageResolver('rose');
    const rev = await resolver.buildInitialRevision();
    expect(rev.pages).toHaveLength(ROSE_SYSTEM_PAGE_IDS.length);
    expect(rev.pages.map((p) => p.id).sort()).toEqual(
      [...ROSE_SYSTEM_PAGE_IDS].sort(),
    );
  });

  it('pagesData contains content for all system pages', async () => {
    const resolver = getPageResolver('rose');
    const rev = await resolver.buildInitialRevision();
    expect(Object.keys(rev.pagesData)).toHaveLength(ROSE_SYSTEM_PAGE_IDS.length);
    for (const id of rev.pages.map((p) => p.id)) {
      expect(rev.pagesData[id]).toBeDefined();
      expect(rev.pagesData[id].content).toBeInstanceOf(Array);
    }
  });

  it('home is currentPageId', async () => {
    const resolver = getPageResolver('rose');
    const rev = await resolver.buildInitialRevision();
    expect(rev.currentPageId).toBe('home');
  });

  it('normalizeRevision on legacy revision adds missing system pages', async () => {
    const resolver = getPageResolver('rose');
    const legacy = {
      pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }],
      pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
    };
    const normalized = resolver.normalizeRevision(legacy);
    expect(normalized.pages).toHaveLength(ROSE_SYSTEM_PAGE_IDS.length);
    expect(normalized.themeId).toBe('rose');
  });
});
