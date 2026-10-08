import { describe, expect, it } from 'vitest';
import { SEO_LIMIT_BYTES, checkSeo, seoProblems } from '../src/seo';
import { errorOf } from './support';

const PAGE =
  '<html lang="ru-RU"><head><title>Стенд Nova</title><meta name="description" content="Магазин">' +
  '<link rel="canonical" href="https://nova-stand.example/"></head><body><h1>Стенд Nova</h1></body></html>';

describe('seoProblems', () => {
  it('страница по договору — проблем нет', () => {
    expect(seoProblems(PAGE)).toEqual([]);
  });

  it.each<[string, string, string]>([
    ['без языка', PAGE.replace(' lang="ru-RU"', ''), 'нет языка у <html>'],
    ['пустой заголовок', PAGE.replace('<title>Стенд Nova</title>', '<title></title>'), 'нет заголовка <title>'],
    [
      'без описания',
      PAGE.replace('<meta name="description" content="Магазин">', ''),
      'нет описания <meta name="description">',
    ],
    ['канонический адрес не https', PAGE.replace('https://nova', 'http://nova'), 'нет канонического адреса https://'],
  ])('%s — «%s»', (_title, html, problem) => {
    expect(seoProblems(html)).toEqual([problem]);
  });

  it('страница больше 2 МБ — проблема', () => {
    const huge = PAGE.replace('<h1>', `<p>${'я'.repeat(SEO_LIMIT_BYTES / 2)}</p><h1>`);
    expect(seoProblems(huge)).toEqual(['страница больше 2 МБ: поисковик прочтёт только начало']);
  });
});

describe('checkSeo', () => {
  it('проблемы — одной ошибкой seo-contract с адресом страницы', () => {
    const error = errorOf(() =>
      checkSeo('/', PAGE.replace(' lang="ru-RU"', '').replace('<title>Стенд Nova</title>', '')),
    );
    expect(error.code).toBe('seo-contract');
    expect(error.message).toBe('/: нет языка у <html>; нет заголовка <title>');
  });

  it('страница по договору — молчит', () => {
    expect(() => checkSeo('/', PAGE)).not.toThrow();
  });
});
