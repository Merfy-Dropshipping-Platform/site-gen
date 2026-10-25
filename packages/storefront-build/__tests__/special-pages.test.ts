import { describe, expect, it } from 'vitest';
import specialPagesJson from '../special-pages.json';
import { RECORD_TYPES } from '../src/records';
import {
  HOME_PAGE,
  NOT_FOUND_PAGE_ID,
  SPECIAL_PAGES,
  SPECIAL_PAGE_IDS,
  SPECIAL_PAGE_SLUGS,
  STATIC_SPECIAL_PAGES,
  parseSpecialPages,
} from '../src/special-pages';

// Особые страницы блока 10 (часть 10а, Р10а-14, Р10а-15): id и адреса пяти тем; копии адресов и страницы не из секций.
const BLOCK10_PAGES = [
  { id: 'page-cart', name: 'Корзина', slug: '/cart' },
  { id: 'page-checkout', name: 'Оформление заказа', slug: '/checkout', sections: false },
  { id: 'page-checkout-result', name: 'Спасибо за заказ', slug: '/checkout-result', sections: false },
  { id: 'page-profile', name: 'Профиль', slug: '/account/profile', aliases: ['/account'] },
  { id: 'page-wishlist', name: 'Избранное', slug: '/wishlist' },
  { id: 'page-orders', name: 'Заказы', slug: '/account/orders' },
  { id: 'page-login', name: 'Вход', slug: '/login', aliases: ['/verify'] },
];

// Особые страницы платформы (блок 7 «Секций и SDK», часть 7а): постоянные id и адреса. Шаблоны записей (блок 8, часть
// 8б): адрес — образец, заняты id шаблона и первая часть адреса.
describe('особые страницы платформы', () => {
  it('главная, пять шаблонов записей и «Страница 404»', () => {
    expect(SPECIAL_PAGES).toEqual([
      { id: 'home', name: 'Главная', slug: '/' },
      { id: 'product', name: 'Товар', slug: '/product/:slug' },
      { id: 'collection', name: 'Коллекция', slug: '/collections/:slug' },
      { id: 'catalog', name: 'Каталог', slug: '/catalog' },
      { id: 'blog', name: 'Блог', slug: '/blogs/:slug' },
      { id: 'article', name: 'Запись блога', slug: '/blogs/:blog/:slug' },
      { id: 'policy', name: 'Политика', slug: '/legal/:slug' },
      ...BLOCK10_PAGES,
      { id: 'not-found', name: 'Страница 404', slug: '/404' },
    ]);
    // Каталог (блок 11, Р11а-1) — после «Коллекции».
    expect([...SPECIAL_PAGE_IDS]).toEqual([
      'home',
      'product',
      'collection',
      'catalog',
      'blog',
      'article',
      'policy',
      ...BLOCK10_PAGES.map((page) => page.id),
      'not-found',
    ]);
    expect(RECORD_TYPES.every((type) => SPECIAL_PAGE_IDS.has(type))).toBe(true);
    expect([...SPECIAL_PAGE_SLUGS]).toEqual([
      '/',
      '/product',
      '/collections',
      '/catalog',
      '/blogs',
      '/legal',
      '/cart',
      '/checkout',
      '/checkout-result',
      '/account',
      '/wishlist',
      '/login',
      '/verify',
      '/404',
    ]);
    expect(SPECIAL_PAGE_IDS.has(NOT_FOUND_PAGE_ID)).toBe(true);
    expect(HOME_PAGE).toEqual({ id: 'home', path: '/' });
  });

  it('список проверяется: повтор, адрес не с /, неверный образец, первая не главная — ошибка', () => {
    expect(parseSpecialPages(specialPagesJson)).toEqual(SPECIAL_PAGES);
    const home = { id: 'home', name: 'Главная', slug: '/' };
    const product = { id: 'product', name: 'Товар', slug: '/product/:slug' };
    expect(parseSpecialPages([home, product])).toEqual([home, product]);
    expect(() => parseSpecialPages([home, product, product])).toThrow('особые страницы');
    for (const slug of ['product/:slug', '/product/:Slug', '/product/:', '/product/X', '/:slug', '/product//:slug']) {
      expect(() => parseSpecialPages([home, { ...product, slug }])).toThrow('особые страницы');
    }
    expect(() => parseSpecialPages([product])).toThrow('особые страницы');
  });
});

describe('особые страницы блока 10', () => {
  const home = { id: 'home', name: 'Главная', slug: '/' };

  it('страницы блока 10 — строки page-… по порядку списка', () => {
    expect(STATIC_SPECIAL_PAGES.map((page) => page.id)).toEqual(BLOCK10_PAGES.map((page) => page.id));
  });

  it('адрес из нескольких частей — можно; копия с образцом, копия чужого адреса, sections: true — ошибка', () => {
    expect(parseSpecialPages([home, { id: 'page-orders', name: 'Заказы', slug: '/account/orders' }])).toHaveLength(2);
    const bad = [
      { id: 'page-login', name: 'Вход', slug: '/login', aliases: ['/verify/:token'] },
      { id: 'page-login', name: 'Вход', slug: '/login', aliases: ['/'] },
      { id: 'page-login', name: 'Вход', slug: '/login', aliases: ['/login'] },
      { id: 'page-cart', name: 'Корзина', slug: '/cart', sections: true },
      { id: 'page-cart', name: 'Корзина', slug: '/Cart' },
    ];
    for (const page of bad) expect(() => parseSpecialPages([home, page])).toThrow('особые страницы');
  });
});
