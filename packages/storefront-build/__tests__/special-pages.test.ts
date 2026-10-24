import { describe, expect, it } from 'vitest';
import specialPagesJson from '../special-pages.json';
import { RECORD_TYPES } from '../src/records';
import {
  HOME_PAGE,
  NOT_FOUND_PAGE_ID,
  SPECIAL_PAGES,
  SPECIAL_PAGE_IDS,
  SPECIAL_PAGE_SLUGS,
  parseSpecialPages,
} from '../src/special-pages';

// Особые страницы платформы (блок 7 «Секций и SDK», часть 7а): постоянные id и адреса. Шаблоны записей (блок 8, часть
// 8б): адрес — образец, заняты id шаблона и первая часть адреса.
describe('особые страницы платформы', () => {
  it('главная, пять шаблонов записей и «Страница 404»', () => {
    expect(SPECIAL_PAGES).toEqual([
      { id: 'home', name: 'Главная', slug: '/' },
      { id: 'product', name: 'Товар', slug: '/product/:slug' },
      { id: 'collection', name: 'Коллекция', slug: '/collections/:slug' },
      { id: 'blog', name: 'Блог', slug: '/blogs/:slug' },
      { id: 'article', name: 'Запись блога', slug: '/blogs/:blog/:slug' },
      { id: 'policy', name: 'Политика', slug: '/legal/:slug' },
      { id: 'not-found', name: 'Страница 404', slug: '/404' },
    ]);
    expect([...SPECIAL_PAGE_IDS]).toEqual(['home', ...RECORD_TYPES, 'not-found']);
    expect([...SPECIAL_PAGE_SLUGS]).toEqual(['/', '/product', '/collections', '/blogs', '/legal', '/404']);
    expect(SPECIAL_PAGE_IDS.has(NOT_FOUND_PAGE_ID)).toBe(true);
    expect(HOME_PAGE).toEqual({ id: 'home', path: '/' });
  });

  it('список проверяется: повтор, адрес не с /, неверный образец, первая не главная — ошибка', () => {
    expect(parseSpecialPages(specialPagesJson)).toEqual(SPECIAL_PAGES);
    const home = { id: 'home', name: 'Главная', slug: '/' };
    const product = { id: 'product', name: 'Товар', slug: '/product/:slug' };
    expect(parseSpecialPages([home, product])).toEqual([home, product]);
    expect(() => parseSpecialPages([home, product, product])).toThrow('особые страницы');
    for (const slug of ['product/:slug', '/product/:Slug', '/product/:', '/product/x', '/:slug', '/product//:slug']) {
      expect(() => parseSpecialPages([home, { ...product, slug }])).toThrow('особые страницы');
    }
    expect(() => parseSpecialPages([product])).toThrow('особые страницы');
  });
});
