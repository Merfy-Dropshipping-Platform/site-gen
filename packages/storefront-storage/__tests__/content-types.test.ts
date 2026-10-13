import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT_TYPE, cacheClassOf, contentTypeOf } from '../src/content-types';

describe('тип содержимого и кэш по пути файла', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['_astro/index.DlYk3bQ2.css', 'text/css; charset=utf-8'],
    ['_astro/client.B1x9.js', 'text/javascript; charset=utf-8'],
    ['sitemap.xml', 'application/xml; charset=utf-8'],
    ['robots.txt', 'text/plain; charset=utf-8'],
    ['fonts/Manrope.WOFF2', 'font/woff2'],
    ['images/logo.svg', 'image/svg+xml'],
  ])('%s — %s', (path, type) => {
    expect(contentTypeOf(path)).toBe(type);
  });

  it.each(['LICENSE', '.well-known/x', 'data.bin'])('%s — тип по умолчанию', (path) => {
    expect(contentTypeOf(path)).toBe(DEFAULT_CONTENT_TYPE);
  });

  it('файлы с отпечатком в имени (_astro/, _merfy/ блока 7) — кэш навсегда, остальное — с проверкой', () => {
    expect(cacheClassOf('_astro/index.DlYk3bQ2.css')).toBe('immutable');
    expect(cacheClassOf('_merfy/shell/0123456789abcdef/shell.js')).toBe('immutable');
    expect(cacheClassOf(`_merfy/m/${'a'.repeat(64)}.js`)).toBe('immutable');
    expect(cacheClassOf('_fonts/onest-cyrillic-wght.68e5e01d6265bd68.woff2')).toBe('immutable');
    expect(cacheClassOf('images/_fonts/x.woff2')).toBe('revalidate');
    expect(cacheClassOf('images/_merfy/m/x.js')).toBe('revalidate');
    expect(cacheClassOf('index.html')).toBe('revalidate');
    expect(cacheClassOf('images/_astro/logo.svg')).toBe('revalidate');
  });
});
