import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateRevisionData } from '../revision-migrations';

/**
 * b45-fix (продолжение): `migrateCatalogPage`, `migrateCollectionPage` и
 * `migrateProductPage` — последние три миграции этого файла, которые ещё
 * брали id блоков из `Date.now()`. Соседи (`migrateCartPage`,
 * `migrateCheckoutPage`, `seedProfilePage` и т.д.) уже почищены — см.
 * комментарии «b45-fix: детерминированные id (не Date.now())» и
 * `revision-migrations-system-pages-stable-ids.test.ts`, который проверяет
 * тот же инвариант для служебных страниц (профиль/заказы/вход/избранное/
 * чекаут). Этот файл закрывает catalog/collection/product.
 *
 * Прод: `PreviewController.loadRevisionData` гоняет `migrateRevisionData`
 * на КАЖДЫЙ GET БЕЗ персиста. Конструктор (редактор) и iframe (`/preview`)
 * читают одну и ту же неперсистентную ревизию ДВУМЯ независимыми HTTP-
 * запросами — с `Date.now()`-id каждый запрос получал СВОЙ id для одного и
 * того же блока (`Catalog-<epoch-ms>` на странице каталога, меняющийся при
 * каждом GET — 4 из 8 живых магазинов). Тест проверяет ИМЕННО это: ДВА
 * НЕЗАВИСИМЫХ вызова `migrateRevisionData` над ОДНИМИ и ТЕМИ ЖЕ
 * неперсистентными легаси-данными обязаны давать байт-в-байт одинаковый
 * результат.
 */

const FILE = resolve(__dirname, '../revision-migrations.ts');

/** «Чистая» легаси-ревизия — как лежит в БД у сайта, который не открывал ни
 * каталог (082+), ни коллекцию (082+), ни товар (078+) после появления этих
 * миграций:
 *   - `page-catalog` — ровно легаси-сид [Header, PopularProducts, Footer]
 *     (единственная форма, которую `migrateCatalogPage` переписывает);
 *   - `page-collection` и `page-product` отсутствуют вовсе (обе миграции
 *     сеют их с нуля при первом чтении — это и есть легаси-форма для них).
 */
function legacyInput() {
  return {
    pages: [{ id: 'home', name: 'Главная', slug: '/' }],
    pagesData: {
      home: {
        content: [
          { type: 'Header', props: { id: 'Header-home' } },
          { type: 'Footer', props: { id: 'Footer-home' } },
        ],
      },
      'page-catalog': {
        content: [
          { type: 'Header', props: { id: 'Header-catalog-legacy' } },
          { type: 'PopularProducts', props: {} },
          { type: 'Footer', props: { id: 'Footer-catalog-legacy' } },
        ],
      },
    },
  };
}

type PagesData = Record<string, { content?: Array<{ type?: string; props?: Record<string, unknown> }> } | undefined>;

const idsOf = (pagesData: PagesData, pageId: string): unknown[] =>
  (pagesData[pageId]?.content ?? []).map((b) => b?.props?.id);

const typesOf = (pagesData: PagesData, pageId: string): unknown[] =>
  (pagesData[pageId]?.content ?? []).map((b) => b?.type);

/**
 * Два НЕЗАВИСИМЫХ прогона на СВЕЖИХ копиях легаси-входа с гарантированно
 * разным `Date.now()` между ними — тот же приём, что в
 * `revision-migrations-system-pages-stable-ids.test.ts#twoIndependentReads`.
 * Мокаем `Date.now()`, а не полагаемся на реальную задержку между вызовами.
 */
function twoIndependentReads(themeId: string) {
  const nowSpy = jest.spyOn(Date, 'now');
  try {
    nowSpy.mockReturnValue(1_700_000_000_000);
    const first = migrateRevisionData(legacyInput(), themeId) as { pagesData: PagesData };
    nowSpy.mockReturnValue(1_800_000_000_000); // «намного позже» — другой запрос
    const second = migrateRevisionData(legacyInput(), themeId) as { pagesData: PagesData };
    return { first, second };
  } finally {
    nowSpy.mockRestore();
  }
}

const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'];

describe('b45-fix: catalog/collection/product — id не зависят от Date.now()', () => {
  it.each(THEMES)(
    '%s — два независимых вызова migrateRevisionData дают байт-в-байт одинаковый результат',
    (themeId) => {
      const { first, second } = twoIndependentReads(themeId);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    },
  );

  it('страховка: сравнение выше не проходит на пустых списках — блоки реально сгенерированы', () => {
    const { first } = twoIndependentReads('rose');
    expect(typesOf(first.pagesData, 'page-catalog').length).toBeGreaterThan(0);
    expect(typesOf(first.pagesData, 'page-collection').length).toBeGreaterThan(0);
    expect(typesOf(first.pagesData, 'page-product').length).toBeGreaterThan(0);
  });

  it('page-catalog: Catalog заменяет легаси PopularProducts с id "Catalog-1" (сид theme.json)', () => {
    const { first, second } = twoIndependentReads('rose');
    expect(typesOf(first.pagesData, 'page-catalog')).toEqual(['Header', 'Catalog', 'Footer']);
    expect(idsOf(first.pagesData, 'page-catalog')).toEqual([
      'Header-catalog-legacy',
      'Catalog-1',
      'Footer-catalog-legacy',
    ]);
    expect(idsOf(second.pagesData, 'page-catalog')).toEqual(idsOf(first.pagesData, 'page-catalog'));
  });

  it('page-collection: id совпадают с сидом theme.json (Catalog-collection и т.д.)', () => {
    const { first, second } = twoIndependentReads('rose');
    expect(idsOf(first.pagesData, 'page-collection')).toEqual([
      'Header-home', // лифтится с главной (getHomeChrome) — не новый id.
      'Hero-collection',
      'Catalog-collection',
      'Footer-home',
    ]);
    expect(idsOf(second.pagesData, 'page-collection')).toEqual(idsOf(first.pagesData, 'page-collection'));
  });

  it('page-product: id совпадают с сидом theme.json (Product-1, PopularProducts-product)', () => {
    const { first, second } = twoIndependentReads('rose');
    expect(idsOf(first.pagesData, 'page-product')).toEqual([
      'Header-home', // лифтится с главной (getHomeChrome) — не новый id.
      'Product-1',
      'PopularProducts-product',
      'Newsletter-product',
      'Footer-home',
    ]);
    expect(idsOf(second.pagesData, 'page-product')).toEqual(idsOf(first.pagesData, 'page-product'));
  });

  it('page-collection: без Header/Footer на главной — свой фолбэк-id тоже детерминирован', () => {
    const noChromeInput = () => ({
      pages: [{ id: 'home', name: 'Главная', slug: '/' }],
      pagesData: { home: { content: [] } },
    });
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(1_700_000_000_000);
      const first = migrateRevisionData(noChromeInput()) as { pagesData: PagesData };
      nowSpy.mockReturnValue(1_800_000_000_000);
      const second = migrateRevisionData(noChromeInput()) as { pagesData: PagesData };
      expect(idsOf(first.pagesData, 'page-collection')).toEqual([
        'Header-collection',
        'Hero-collection',
        'Catalog-collection',
        'Footer-collection',
      ]);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    } finally {
      nowSpy.mockRestore();
    }
  });
});

/**
 * Сторож: `revision-migrations.ts` больше не зовёт `Date.now()` в коде (вне
 * комментариев). Тот же приём, что `no-theme-branches-in-migrations.spec.ts`
 * — грубый strip `/* … *\/` и `// …`, затем точный поиск подстроки. Белый
 * список пуст: сейчас в файле не осталось ни одного осознанно оставленного
 * `Date.now()`. Если появится обоснованный случай — добавить запись
 * `{ needle, reason }` сюда, а не молча расширять допуск.
 */
const WHITELIST: Array<{ needle: string; reason: string }> = [];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('revision-migrations.ts не содержит Date.now() вне комментариев', () => {
  const rawSource = readFileSync(FILE, 'utf-8');
  const codeOnly = stripComments(rawSource);

  it('файл существует и непустой (страховка от опечатки в пути)', () => {
    expect(rawSource.length).toBeGreaterThan(1000);
  });

  it('нет Date.now() в коде за вычетом белого списка', () => {
    let remaining = codeOnly;
    for (const { needle } of WHITELIST) {
      remaining = remaining.replace(needle, '');
    }
    const count = (remaining.match(/Date\.now\(\)/g) ?? []).length;
    expect(count).toBe(0);
  });

  it('комментарии b45-fix у catalog/collection/product на месте (не просто удалён вызов)', () => {
    expect(rawSource).toMatch(/function migrateCatalogPage[\s\S]{0,800}b45-fix/);
    expect(rawSource).toMatch(/function migrateCollectionPage[\s\S]{0,800}b45-fix/);
    expect(rawSource).toMatch(/function migrateProductPage[\s\S]{0,800}b45-fix/);
  });
});
