/**
 * Catalog URL params helper — pure parse/serialize logic test.
 *
 * Production behavior: Catalog.astro reads Astro.url.searchParams via
 * parseCatalogUrlParams() to derive collection/page/sort/availability/colors/price
 * filter state, and serializes back to URL via serializeCatalogUrlParams().
 *
 * This unit-tests the pure helper extracted from the .astro file. Defaults
 * round-trip to empty query (so canonical URL is /catalog without spurious params).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCatalogUrlParams, serializeCatalogUrlParams, type CatalogUrlState } from '../blocks/Catalog/url-params';

describe('parseCatalogUrlParams', () => {
  it('returns defaults when query is empty', () => {
    const params = new URLSearchParams('');
    const result = parseCatalogUrlParams(params);
    expect(result).toEqual({
      query: undefined,
      collection: undefined,
      page: 1,
      sort: 'newest',
      availability: 'all',
      colors: [],
      priceMin: undefined,
      priceMax: undefined,
    });
  });

  it('parses collection from ?collection=URBAN', () => {
    const result = parseCatalogUrlParams(new URLSearchParams('collection=URBAN'));
    expect(result.collection).toBe('URBAN');
  });

  it('parses page=2 (clamped to >= 1)', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('page=2')).page).toBe(2);
    expect(parseCatalogUrlParams(new URLSearchParams('page=0')).page).toBe(1);
    expect(parseCatalogUrlParams(new URLSearchParams('page=-5')).page).toBe(1);
    expect(parseCatalogUrlParams(new URLSearchParams('page=abc')).page).toBe(1);
  });

  it('parses sort from allowed values, falls back to newest', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('sort=price-asc')).sort).toBe('price-asc');
    expect(parseCatalogUrlParams(new URLSearchParams('sort=price-desc')).sort).toBe('price-desc');
    expect(parseCatalogUrlParams(new URLSearchParams('sort=popularity')).sort).toBe('popularity');
    expect(parseCatalogUrlParams(new URLSearchParams('sort=newest')).sort).toBe('newest');
    expect(parseCatalogUrlParams(new URLSearchParams('sort=garbage')).sort).toBe('newest');
  });

  it('parses availability: in/out/all', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('availability=in')).availability).toBe('in');
    expect(parseCatalogUrlParams(new URLSearchParams('availability=out')).availability).toBe('out');
    expect(parseCatalogUrlParams(new URLSearchParams('availability=garbage')).availability).toBe('all');
  });

  it('parses colors as comma-separated list', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('color=red,blue')).colors).toEqual(['red', 'blue']);
    expect(parseCatalogUrlParams(new URLSearchParams('color=')).colors).toEqual([]);
    expect(parseCatalogUrlParams(new URLSearchParams('color=red, blue ,green')).colors).toEqual(['red', 'blue', 'green']);
  });

  it('parses priceMin and priceMax as numbers', () => {
    const r = parseCatalogUrlParams(new URLSearchParams('priceMin=100&priceMax=500'));
    expect(r.priceMin).toBe(100);
    expect(r.priceMax).toBe(500);
  });

  it('ignores invalid price values', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('priceMin=abc')).priceMin).toBeUndefined();
    expect(parseCatalogUrlParams(new URLSearchParams('priceMin=-50')).priceMin).toBeUndefined();
  });
});

describe('serializeCatalogUrlParams', () => {
  it('produces empty string for default state', () => {
    const state: CatalogUrlState = {
      query: undefined,
      collection: undefined,
      page: 1,
      sort: 'newest',
      availability: 'all',
      colors: [],
      priceMin: undefined,
      priceMax: undefined,
    };
    expect(serializeCatalogUrlParams(state)).toBe('');
  });

  it('produces minimal query for non-default values', () => {
    const state: CatalogUrlState = {
      query: undefined,
      collection: 'URBAN',
      page: 2,
      sort: 'price-asc',
      availability: 'in',
      colors: ['red'],
      priceMin: 100,
      priceMax: 500,
    };
    const result = serializeCatalogUrlParams(state);
    expect(result).toContain('collection=URBAN');
    expect(result).toContain('page=2');
    expect(result).toContain('sort=price-asc');
    expect(result).toContain('availability=in');
    expect(result).toContain('color=red');
    expect(result).toContain('priceMin=100');
    expect(result).toContain('priceMax=500');
  });
});

/**
 * Баг тестера #5 (18.09): «Rose: поиск в каталоге не фильтрует — форма GET
 * /catalog, поле q. /catalog?q=тинт → все 5 товаров, /catalog?q=ZZZNOTHING →
 * тоже все».
 *
 * Замер 19.09: форма поиска (`<input name="q">`) есть во ВСЕХ темах — rose,
 * flux, satin, bloom, luna и в общей шапке theme-base, — а `CatalogUrlState`
 * знал только collection/page/sort/availability/colors/price. Поисковый запрос
 * не парсился ни на сервере, ни в клиентской фильтрации: поиск по магазину не
 * работал нигде.
 */
describe('поисковый запрос из шапки (баг тестера #5)', () => {
  it('parse: q попадает в состояние каталога', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('q=тинт')).query).toBe('тинт');
  });

  it('parse: пробелы по краям срезаются, пустой запрос = нет запроса', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('q=%20%20')).query).toBeUndefined();
    expect(parseCatalogUrlParams(new URLSearchParams('')).query).toBeUndefined();
    expect(parseCatalogUrlParams(new URLSearchParams('q=%20тинт%20')).query).toBe('тинт');
  });

  it('serialize: запрос переживает круг через URL', () => {
    const state = parseCatalogUrlParams(new URLSearchParams('q=тинт&sort=price-asc'));
    const back = new URLSearchParams(serializeCatalogUrlParams(state));
    expect(back.get('q')).toBe('тинт');
    expect(parseCatalogUrlParams(back).query).toBe('тинт');
  });

  it('serialize: без запроса параметр q в адрес не лезет', () => {
    const state: CatalogUrlState = parseCatalogUrlParams(new URLSearchParams(''));
    expect(serializeCatalogUrlParams(state)).toBe('');
  });
});

/**
 * Сторож ЖИВОГО пути: разбор `q` можно оставить идеальным, а рантайм каталога
 * так и не начнёт им фильтровать — тесты при этом будут зелёными. Фильтрация
 * живёт в инлайн-скрипте `Catalog.astro` (модуль `variant-filter.ts` — его
 * зеркало, рантайм его не импортирует), поэтому проверяем сам файл блока.
 */
describe('поиск подключён к рантайму каталога', () => {
  const astro = readFileSync(
    join(__dirname, '..', 'blocks', 'Catalog', 'Catalog.astro'),
    'utf8',
  );

  it('состояние каталога берёт запрос из разобранного URL', () => {
    expect(astro).toContain('query: urlState.query');
  });

  it('фильтрация учитывает запрос', () => {
    expect(astro).toMatch(/if \(state\.query\)/);
  });

  it('запрос переживает обновление адреса при смене фильтров', () => {
    expect(astro).toMatch(/params\.set\('q', state\.query\)/);
  });
});
