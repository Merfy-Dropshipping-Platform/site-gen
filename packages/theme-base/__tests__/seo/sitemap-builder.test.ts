import { buildSitemap } from '../../seo/SitemapBuilder';

describe('buildSitemap', () => {
  it('builds valid XML skeleton with empty array', () => {
    const xml = buildSitemap([]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('</urlset>');
  });

  it('emits <url> blocks for each entry', () => {
    const xml = buildSitemap([
      { loc: 'https://shop.ru/' },
      { loc: 'https://shop.ru/catalog' },
      { loc: 'https://shop.ru/about' },
    ]);
    const urlCount = (xml.match(/<url>/g) ?? []).length;
    expect(urlCount).toBe(3);
    expect(xml).toContain('https://shop.ru/');
  });

  it('includes optional lastmod/changefreq/priority', () => {
    const xml = buildSitemap([
      { loc: 'https://shop.ru/', lastmod: '2026-04-20', changefreq: 'daily', priority: 1.0 },
    ]);
    expect(xml).toContain('<lastmod>2026-04-20</lastmod>');
    expect(xml).toContain('<changefreq>daily</changefreq>');
    expect(xml).toContain('<priority>1.0</priority>');
  });

  it('escapes XML special chars in loc', () => {
    const xml = buildSitemap([{ loc: 'https://shop.ru/?q=a&b=c<x>' }]);
    expect(xml).toContain('https://shop.ru/?q=a&amp;b=c&lt;x&gt;');
    expect(xml).not.toContain('loc>https://shop.ru/?q=a&b');
  });
});
