import { describe, expect, it } from 'vitest';
import type { LogFields } from '../src/log';
import { revisionPagesOf } from '../src/revision-pages';

// Свои страницы из ключа pages ревизии (блок 1 «Секций и SDK», часть 4, Р1-4-8): строки пишет sites (PagesService).
const custom = (id: string, slug: string, extra: object = {}) => ({
  id,
  name: 'О нас',
  slug,
  role: 'custom',
  isCustom: true,
  source: 'user',
  seo: null,
  ...extra,
});

describe('свои страницы ревизии', () => {
  it('только свои; SEO — строки, чего нет — пустая строка', () => {
    const invalid: LogFields[] = [];
    const pages = revisionPagesOf(
      [
        { id: 'home', name: 'Главная', slug: '/', role: 'system' },
        custom('page-custom-1', '/o-nas', { seo: { title: 'О магазине', keywords: 5 } }),
      ],
      (fields) => invalid.push(fields),
    );
    expect(pages).toEqual([
      {
        id: 'page-custom-1',
        slug: '/o-nas',
        name: 'О нас',
        seo: { title: 'О магазине', description: '', keywords: '' },
      },
    ]);
    expect(invalid).toEqual([]);
  });

  it('неверный адрес, повтор адреса, занятые id и адрес — без страницы и строка журнала', () => {
    const invalid: LogFields[] = [];
    const pages = revisionPagesOf(
      [
        custom('page-custom-1', '/o-nas'),
        custom('page-custom-2', '/О нас'),
        custom('page-custom-3', '/o-nas'),
        custom('footer', '/podval'),
        custom('page-custom-4', '/theme-stand'),
        { id: 'page-custom-5', name: 'Без роли', slug: '/bez-roli', isCustom: true },
      ],
      (fields) => invalid.push(fields),
    );
    expect(pages.map((page) => page.id)).toEqual(['page-custom-1', 'page-custom-5']);
    expect(invalid.map((fields) => fields.id)).toEqual(['page-custom-2', 'page-custom-3', 'footer', 'page-custom-4']);
  });
});

describe('особые страницы заняты (блок 7 «Секций и SDK», часть 7а)', () => {
  it('своя страница с id not-found или адресом /404 — без неё и строка журнала; строка особой страницы — не своя', () => {
    const invalid: LogFields[] = [];
    const pages = revisionPagesOf(
      [
        { id: 'not-found', name: 'Страница 404', slug: '/404', role: 'system', isCustom: false },
        custom('not-found', '/stranica'),
        custom('page-custom-1', '/404'),
        custom('page-custom-2', '/o-nas'),
      ],
      (fields) => invalid.push(fields),
    );
    expect(pages.map((page) => page.id)).toEqual(['page-custom-2']);
    expect(invalid.map((fields) => fields.id)).toEqual(['not-found', 'page-custom-1']);
  });
});

describe('адреса шаблонов записей заняты (блок 8 «Секций и SDK», часть 8б)', () => {
  it('своя страница /product или /legal — без неё и строка журнала; строка шаблона — не своя страница', () => {
    const invalid: LogFields[] = [];
    const pages = revisionPagesOf(
      [
        { id: 'product', name: 'Товар', slug: '/product/:slug', role: 'system', isCustom: false },
        custom('page-custom-1', '/product'),
        custom('page-custom-2', '/legal'),
        custom('page-custom-3', '/produkty'),
      ],
      (fields) => invalid.push(fields),
    );
    expect(pages.map((page) => page.id)).toEqual(['page-custom-3']);
    expect(invalid.map((fields) => fields.id)).toEqual(['page-custom-1', 'page-custom-2']);
  });
});
