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
