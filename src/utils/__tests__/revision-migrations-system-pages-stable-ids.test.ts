import { migrateRevisionData } from '../revision-migrations';

/**
 * Владелец 16.09 (уже ПОСЛЕ починки гонки рукопожатия, коммит 4ec8545c):
 * «Баг все темы — при изменениях в секция или параметрах всех секциях и всех
 * параметров, требуется перезагрузка страницы» на служебных страницах
 * (Корзина, Личный кабинет, Заказы, Вход, Избранное, Оформление заказа —
 * «Страницы»/контент-страницы этим багом не задеты, замерено отдельно).
 *
 * Корневая причина. `PreviewController.loadRevisionData` читает
 * `site_revision.data` из БД и на КАЖДЫЙ GET прогоняет его через
 * `migrateRevisionData` — РЕЗУЛЬТАТ НИКУДА НЕ ПЕРСИСТИТСЯ (только SELECT, ни
 * одного UPDATE). До 14.09 у большинства живых сайтов (в т.ч. у всех пяти
 * демо-магазинов, заведённых 18.06) не было тела страниц «Личный кабинет»,
 * «Заказы», «Вход», «Избранное» и «Оформление заказа» вовсе — их досеивают
 * `seedProfilePage`/`seedAccountPageSections`/`seedLoginPageSection`/
 * `seedWishlistPage`/`migrateCheckoutPage`. Эти сидеры до фикса брали id вида
 * `${type}-${Date.now()}`.
 *
 * Конструктор грузит данные редактора и iframe грузит `/preview` ДВУМЯ
 * независимыми HTTP-запросами, каждый заново прогоняет эту же неперсистентную
 * миграцию — и получает СВОЙ Date.now(), то есть СВОЙ id для одного и того же
 * блока. Правка уходит из конструктора с id, которого в живом DOM iframe уже
 * нет: `document.querySelector('[data-puck-component-id="<id>"]')` ничего не
 * находит, и правка отбрасывается — для ЛЮБОЙ секции и ЛЮБОГО параметра,
 * потому что Header/тело/Footer этих страниц получают новый id ВМЕСТЕ, одним
 * прогоном. Живое подтверждение (прод, demo-сайт rose 7483e630…): два
 * последовательных GET `/preview?page=profile` вернули
 * `AccountSection-1789572276414` и `AccountSection-1789572289917` — РАЗНЫЕ id
 * с разницей 13.5 с.
 *
 * Фикс: сидеры больше не зовут `Date.now()` — id детерминированы (совпадают с
 * сидом `packages/theme-<t>/pages/*.json` там, где формат позволяет). Этот
 * файл проверяет ИМЕННО инвариант, которого раньше не было: ДВА НЕЗАВИСИМЫХ
 * вызова `migrateRevisionData` над ОДНИМИ и ТЕМИ ЖЕ неперсистентными данными
 * обязаны давать ОДИНАКОВЫЕ id. (Существующий
 * `revision-migrations-profile.test.ts` проверяет другое — что повторный
 * прогон НАД РЕЗУЛЬТАТОМ первого не плодит дублей; это не ловит баг, потому
 * что второй вызов там видит уже досеянный контент, а не чистую БД-строку.)
 */

type Block = { type?: string; props?: Record<string, unknown> };
type PagesData = Record<string, { content?: Block[] } | undefined>;

/** «Чистая» ревизия — как лежит в БД у сайта, где эти страницы ещё не открывали. */
function freshInput() {
  return {
    pages: [{ id: 'home', name: 'Главная', slug: '/' }],
    pagesData: {
      home: {
        content: [
          { type: 'Header', props: { id: 'Header-home' } },
          { type: 'Footer', props: { id: 'Footer-home' } },
        ],
      },
    },
  };
}

const idsOf = (pagesData: PagesData, pageId: string): unknown[] =>
  (pagesData[pageId]?.content ?? []).map((b) => b?.props?.id);

const typesOf = (pagesData: PagesData, pageId: string): unknown[] =>
  (pagesData[pageId]?.content ?? []).map((b) => b?.type);

/**
 * Два НЕЗАВИСИМЫХ прогона на СВЕЖИХ (не связанных друг с другом) копиях
 * входа, с гарантированно разным `Date.now()` между ними — имитирует два
 * отдельных HTTP-запроса (загрузка редактора конструктором и `/preview` у
 * iframe), которые физически не могут не разойтись по времени в проде.
 * Мокаем `Date.now()`, а не полагаемся на реальную задержку — иначе тест был
 * бы либо flaky (два вызова могут попасть в одну и ту же миллисекунду), либо
 * искусственно медленным.
 */
function twoIndependentReads(themeId: string) {
  const nowSpy = jest.spyOn(Date, 'now');
  try {
    nowSpy.mockReturnValue(1_700_000_000_000);
    const first = migrateRevisionData(freshInput(), themeId) as { pagesData: PagesData };
    nowSpy.mockReturnValue(1_800_000_000_000); // «намного позже» — другой запрос
    const second = migrateRevisionData(freshInput(), themeId) as { pagesData: PagesData };
    return { first, second };
  } finally {
    nowSpy.mockRestore();
  }
}

const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'];
const SYSTEM_PAGES = ['page-profile', 'page-orders', 'page-login', 'page-wishlist', 'page-checkout'];

describe('b45: id служебных страниц не зависят от времени вызова', () => {
  it.each(THEMES)('%s — Личный кабинет/Заказы/Вход/Избранное/Чекаут: id совпадают между двумя независимыми вызовами', (themeId) => {
    const { first, second } = twoIndependentReads(themeId);
    for (const pageId of SYSTEM_PAGES) {
      expect({ pageId, ids: idsOf(second.pagesData, pageId) }).toEqual({
        pageId,
        ids: idsOf(first.pagesData, pageId),
      });
      // Структура тоже не «дрейфует» между вызовами (страховка от того, что
      // сравнение id окажется пустым списком по случайному совпадению).
      expect(typesOf(second.pagesData, pageId).length).toBeGreaterThan(0);
    }
  });

  it('Корзина: id совпадают между двумя независимыми вызовами (нет page-cart вовсе)', () => {
    const { first, second } = twoIndependentReads('rose');
    expect(idsOf(second.pagesData, 'page-cart')).toEqual(idsOf(first.pagesData, 'page-cart'));
    expect(idsOf(second.pagesData, 'page-cart').length).toBeGreaterThan(0);
  });

  it('rose/flux: «Спасибо за заказ» (page-checkout-result) — id тоже детерминированы', () => {
    for (const themeId of ['rose', 'flux']) {
      const { first, second } = twoIndependentReads(themeId);
      expect(idsOf(second.pagesData, 'page-checkout-result')).toEqual(
        idsOf(first.pagesData, 'page-checkout-result'),
      );
      expect(idsOf(second.pagesData, 'page-checkout-result').length).toBeGreaterThan(0);
    }
  });

  it('id тела совпадают с сидом theme.json (AccountSection-1 и т.д.), а не «первый попавшийся»', () => {
    const { first } = twoIndependentReads('rose');
    expect(idsOf(first.pagesData, 'page-profile')).toContain('AccountSection-1');
    expect(idsOf(first.pagesData, 'page-orders')).toContain('OrdersSection-1');
    expect(idsOf(first.pagesData, 'page-login')).toContain('LoginSection-1');
    expect(idsOf(first.pagesData, 'page-wishlist')).toContain('WishlistSection-1');
    expect(idsOf(first.pagesData, 'page-checkout')).toEqual([
      'CheckoutHeader-1',
      'CheckoutForm-1',
      'CheckoutSummary-1',
      'Footer-home', // Footer лифтится с главной (getHomeChrome), см. migrateCheckoutPage.
    ]);
  });
});
