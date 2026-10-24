import { describe, expect, it } from 'vitest';
import specialPagesJson from '../special-pages.json';
import {
  HOME_PAGE,
  NOT_FOUND_PAGE_ID,
  SPECIAL_PAGES,
  SPECIAL_PAGE_IDS,
  SPECIAL_PAGE_SLUGS,
  parseSpecialPages,
} from '../src/special-pages';

// Особые страницы платформы (блок 7 «Секций и SDK», часть 7а): постоянные id и адреса.
describe('особые страницы платформы', () => {
  it('главная и «Страница 404»', () => {
    expect(SPECIAL_PAGES).toEqual([
      { id: 'home', name: 'Главная', slug: '/' },
      { id: 'not-found', name: 'Страница 404', slug: '/404' },
    ]);
    expect([...SPECIAL_PAGE_IDS]).toEqual(['home', 'not-found']);
    expect([...SPECIAL_PAGE_SLUGS]).toEqual(['/', '/404']);
    expect(SPECIAL_PAGE_IDS.has(NOT_FOUND_PAGE_ID)).toBe(true);
    expect(HOME_PAGE).toEqual({ id: 'home', path: '/' });
  });

  it('список проверяется: повтор id или адреса, адрес не с /, первая не главная — ошибка', () => {
    expect(parseSpecialPages(specialPagesJson)).toEqual(SPECIAL_PAGES);
    const [home, notFound] = specialPagesJson;
    expect(() => parseSpecialPages([home, notFound, notFound])).toThrow('особые страницы');
    expect(() => parseSpecialPages([home, { ...notFound, slug: '404' }])).toThrow('особые страницы');
    expect(() => parseSpecialPages([notFound])).toThrow('особые страницы');
  });
});
