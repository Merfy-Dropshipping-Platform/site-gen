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
  // Страница «Заказы» (/account/orders): пункт «Профиль → Заказы» открывал
  // витрину в режиме просмотра — настроить там было нечего.
  'page-orders',
  // Страница «Вход» (/login): заведена в манифест позже остальных, и список
  // здесь за ней не поехал — три проверки этого файла краснели на «13 против
  // 14». Чтобы такое не повторялось молча, ниже стоит отдельная сверка списка
  // с самим манифестом: она называет расхождение, а не просто роняет счётчик.
  'page-login',
];

describe('sites multipage integration', () => {
  it('канонический список совпадает с манифестом темы rose', () => {
    // Источник правды — packages/theme-rose/theme.json. Список выше пинит
    // ПОРЯДОК и состав; расхождение здесь читается как «в манифест добавили
    // страницу, а список не обновили» (или наоборот — страницу потеряли).
    const manifest = require('../../packages/theme-rose/theme.json') as {
      pages: Array<{ id: string }>;
    };
    expect(manifest.pages.map((pg) => pg.id)).toEqual(ROSE_SYSTEM_PAGE_IDS);
  });

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
