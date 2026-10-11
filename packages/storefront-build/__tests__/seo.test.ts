import { describe, expect, it } from 'vitest';
import { SEO_LIMIT_BYTES, checkSeo, seoProblems } from '../src/seo';
import { errorOf } from './support';

// Теги для соцсетей (блок 9) — как их печатает nova; логотипа нет — og:image нет.
const SOCIAL =
  '<meta property="og:type" content="website"><meta property="og:title" content="Стенд Nova">' +
  '<meta property="og:description" content="Магазин"><meta property="og:url" content="https://nova-stand.example/">' +
  '<meta property="og:site_name" content="Стенд Nova"><meta property="og:locale" content="ru_RU">' +
  '<meta name="twitter:card" content="summary">';
const PAGE =
  '<html lang="ru-RU"><head><title>Стенд Nova</title><meta name="description" content="Магазин">' +
  `<link rel="canonical" href="https://nova-stand.example/">${SOCIAL}</head><body><h1>Стенд Nova</h1></body></html>`;
const EMPTY_DESCRIPTION = 'тег <meta name="description"> без текста: нет описания — не рисуй тег';
const EMPTY_KEYWORDS = 'тег <meta name="keywords"> без текста: нет ключевых слов — не рисуй тег';
const OG_TITLE = 'нужен один тег og:title с текстом';
const OG_DESCRIPTION = 'тег og:description без текста: нет описания — не рисуй тег';
const OG_URL = 'нужен один тег og:url с адресом https://';
const OG_SITE_NAME = 'нужен один тег og:site_name с текстом';
const OG_LOCALE = 'нужен один тег og:locale вида ru_RU';
const OG_IMAGE = 'тег og:image без адреса https://: нет картинки — не рисуй тег';
const TWITTER_CARD = 'нужен один тег twitter:card: summary или summary_large_image';
const TITLE_AGAIN = '<meta property="og:title" content="Ещё">';
const LOGO = 'https://s3.merfy.ru/merfy/branding/logo-1.png';
const withKeywords = (content: string): string =>
  PAGE.replace('<link rel', `<meta name="keywords" content="${content}"><link rel`);
const withImage = (content: string): string =>
  PAGE.replace('<meta name="twitter:card"', `<meta property="og:image" content="${content}"><meta name="twitter:card"`);

describe('seoProblems', () => {
  it('страница по договору — проблем нет', () => {
    expect(seoProblems(PAGE)).toEqual([]);
  });

  // Описание мерчант может не заполнить (владелец 08.10: «пользователь его может не заполнить, но при этом сайт должен
  // работать»): тега нет — не ошибка, как у Dawn (Shopify). Тег без текста — ошибка темы.
  it('описания нет вовсе — проблем нет', () => {
    expect(seoProblems(PAGE.replace('<meta name="description" content="Магазин">', ''))).toEqual([]);
  });

  it('ключевые слова заполнены — проблем нет', () => {
    expect(seoProblems(withKeywords('шарфы, лён'))).toEqual([]);
  });

  it('описания нет — нет и og:description: проблем нет', () => {
    const plain = PAGE.replace('<meta name="description" content="Магазин">', '').replace(
      '<meta property="og:description" content="Магазин">',
      '',
    );
    expect(seoProblems(plain)).toEqual([]);
  });

  it('картинка по https и большая карточка — проблем нет', () => {
    const page = withImage(LOGO).replace('content="summary"', 'content="summary_large_image"');
    expect(seoProblems(page)).toEqual([]);
  });

  it.each<[string, string, string]>([
    ['без языка', PAGE.replace(' lang="ru-RU"', ''), 'нет языка у <html>'],
    ['пустой заголовок', PAGE.replace('<title>Стенд Nova</title>', '<title></title>'), 'нет заголовка <title>'],
    ['описание без значения', PAGE.replace('content="Магазин"', 'content'), EMPTY_DESCRIPTION],
    ['описание пустое', PAGE.replace('content="Магазин"', 'content=""'), EMPTY_DESCRIPTION],
    ['описание из пробелов', PAGE.replace('content="Магазин"', 'content="  "'), EMPTY_DESCRIPTION],
    ['ключевые слова пустые', withKeywords(''), EMPTY_KEYWORDS],
    ['ключевые слова из пробелов', withKeywords(' '), EMPTY_KEYWORDS],
    ['канонический адрес не https', PAGE.replace('https://nova', 'http://nova'), 'нет канонического адреса https://'],
  ])('%s — «%s»', (_title, html, problem) => {
    expect(seoProblems(html)).toEqual([problem]);
  });

  // Теги для соцсетей (блок 9): у страницы всегда есть заголовок, тип, адрес, имя, язык и карточка — один тег каждого;
  // описание и картинку мерчант может не дать — тогда тега нет, а пустой тег — ошибка темы.
  it.each<[string, string, string]>([
    ['og:title нет', PAGE.replace('<meta property="og:title" content="Стенд Nova">', ''), OG_TITLE],
    ['og:title пустой', PAGE.replace('og:title" content="Стенд Nova"', 'og:title" content=""'), OG_TITLE],
    ['og:title дважды', PAGE.replace('<meta property="og:type"', `${TITLE_AGAIN}<meta property="og:type"`), OG_TITLE],
    [
      'og:description из пробелов',
      PAGE.replace('Магазин"><meta property="og:url"', ' "><meta property="og:url"'),
      OG_DESCRIPTION,
    ],
    [
      'og:type нет',
      PAGE.replace('<meta property="og:type" content="website">', ''),
      'нужен один тег og:type с текстом',
    ],
    ['og:url не https', PAGE.replace('og:url" content="https:', 'og:url" content="http:'), OG_URL],
    ['og:site_name пустое', PAGE.replace('site_name" content="Стенд Nova"', 'site_name" content=""'), OG_SITE_NAME],
    ['og:locale как у html', PAGE.replace('content="ru_RU"', 'content="ru-RU"'), OG_LOCALE],
    ['og:image пустой', withImage(''), OG_IMAGE],
    ['og:image по http', withImage(LOGO.replace('https:', 'http:')), OG_IMAGE],
    ['twitter:card нет', PAGE.replace('<meta name="twitter:card" content="summary">', ''), TWITTER_CARD],
    ['twitter:card чужой', PAGE.replace('content="summary"', 'content="photo"'), TWITTER_CARD],
  ])('соцсети: %s', (_title, html, problem) => {
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
