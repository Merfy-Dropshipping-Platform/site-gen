import { describe, expect, it } from 'vitest';
import { SITEMAP_LIMIT, seoFiles } from '../src/sitemap';
import { HOME, SCARF, buildOf } from './manifests';

const PUBLIC_URL = 'https://scarf.merfy.ru';
const COLLECTION = { path: '/collections/winter/', entity: 'collection:00000000-0000-4000-8000-000000000301' };
const POLICY = {
  path: '/policies/returns/',
  entity: 'policy:00000000-0000-4000-8000-000000000201',
  updatedAt: '2026-10-05T08:00:00.000Z',
};
const BILLING = { path: '/billing/badge/', entity: 'billing:00000000-0000-4000-8000-000000000401' };

const textOf = (files: { path: string; text: string }[], path: string): string | undefined =>
  files.find((file) => file.path === path)?.text;

describe('robots.txt и карта сайта', () => {
  it('магазин не для поиска (стенд) — robots закрывает всё, карты нет', () => {
    const { manifest } = buildOf([HOME, SCARF]);
    expect(seoFiles({ manifest, publicUrl: PUBLIC_URL, indexable: false })).toEqual([
      { path: '/robots.txt', text: 'User-agent: *\nDisallow: /\n' },
    ]);
  });

  it('robots.txt ссылается на индекс карты', () => {
    const files = seoFiles({ manifest: buildOf([HOME]).manifest, publicUrl: PUBLIC_URL, indexable: true });
    expect(textOf(files, '/robots.txt')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://scarf.merfy.ru/sitemap.xml\n',
    );
  });

  it('страницы — по файлам типов; служебные (billing) в карту не попадают', () => {
    const { manifest } = buildOf([HOME, SCARF, COLLECTION, POLICY, BILLING]);
    const files = seoFiles({ manifest, publicUrl: PUBLIC_URL, indexable: true });
    expect(files.map((file) => file.path)).toEqual([
      '/robots.txt',
      '/sitemap.xml',
      '/sitemap-pages.xml',
      '/sitemap-products.xml',
      '/sitemap-collections.xml',
    ]);
    expect(files.map((file) => file.text).join('')).not.toContain('/billing/');
  });

  it('файл типа: адрес и lastmod — дата правки данных страницы', () => {
    const { manifest } = buildOf([HOME, POLICY]);
    const files = seoFiles({ manifest, publicUrl: `${PUBLIC_URL}/`, indexable: true });
    expect(textOf(files, '/sitemap-pages.xml')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '<url><loc>https://scarf.merfy.ru/</loc><lastmod>2026-10-06T09:00:00.000Z</lastmod></url>',
        '<url><loc>https://scarf.merfy.ru/policies/returns/</loc><lastmod>2026-10-05T08:00:00.000Z</lastmod></url>',
        '</urlset>',
        '',
      ].join('\n'),
    );
  });

  it('индекс: файлы типов, lastmod — самая свежая дата в файле', () => {
    const { manifest } = buildOf([HOME, POLICY, SCARF]);
    const files = seoFiles({ manifest, publicUrl: PUBLIC_URL, indexable: true });
    expect(textOf(files, '/sitemap.xml')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '<sitemap><loc>https://scarf.merfy.ru/sitemap-pages.xml</loc><lastmod>2026-10-06T09:00:00.000Z</lastmod></sitemap>',
        '<sitemap><loc>https://scarf.merfy.ru/sitemap-products.xml</loc><lastmod>2026-10-06T09:00:00.000Z</lastmod></sitemap>',
        '</sitemapindex>',
        '',
      ].join('\n'),
    );
  });

  it('больше 50 000 адресов — следующий файл', () => {
    const { manifest } = buildOf([HOME, SCARF]);
    const pages = Array.from({ length: SITEMAP_LIMIT + 1 }, (_, index) => ({
      ...manifest.pages[1],
      path: `/products/p-${index}/`,
    }));
    const files = seoFiles({ manifest: { ...manifest, pages }, publicUrl: PUBLIC_URL, indexable: true });
    expect(files.map((file) => file.path)).toEqual([
      '/robots.txt',
      '/sitemap.xml',
      '/sitemap-products.xml',
      '/sitemap-products-2.xml',
    ]);
    expect(textOf(files, '/sitemap-products-2.xml')?.match(/<url>/g)).toHaveLength(1);
  });

  it('адрес с кириллицей и & — закодирован и экранирован', () => {
    const { manifest } = buildOf([HOME, { ...SCARF, path: '/products/осень & зима/' }]);
    const files = seoFiles({ manifest, publicUrl: PUBLIC_URL, indexable: true });
    expect(textOf(files, '/sitemap-products.xml')).toContain(
      '<loc>https://scarf.merfy.ru/products/%D0%BE%D1%81%D0%B5%D0%BD%D1%8C%20&amp;%20%D0%B7%D0%B8%D0%BC%D0%B0/</loc>',
    );
  });
});
