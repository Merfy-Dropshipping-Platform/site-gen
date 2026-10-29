import type { ArticleCard, PageInfo, PageList } from '@merfy/storefront-build';
import { sampleRecord } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceProblems, attr, panelOf, renderSection, tags, type RenderedSection } from './shop-section-render';

// «Блог», «Статья» и «Страница» — страницы блога, записи и политик (базовые секции, 29.10). Панель — как у BlogSection,
// BlogPostSection и Page на проде (Отступы, Цветовая схема; у «Страницы» — ещё «Выбор страницы» и «Размер заголовка»),
// новые поля «Блога» — после полей прода. Записи блога — список страницы (page.list) с номерами страниц.
const BLOG = sampleRecord('blog');
const ARTICLE = sampleRecord('article');
const POLICY = sampleRecord('policy');

const card = (
  id: string,
  title: string,
  publishedAt: string | null,
  cover: string | null,
  excerpt: string,
): ArticleCard => ({
  id,
  title,
  url: `/blogs/novosti/${id}`,
  publishedAt,
  publishedText: publishedAt === null ? '' : '19 октября 2026 г.',
  cover,
  excerpt,
});
const CARDS = [
  card('kak-stirat', 'Как стирать плед', '2026-10-19T09:30:00.000Z', 'https://s3.merfy.ru/b/1.jpg', 'Вручную, при 30°'),
  card('novaya', 'Новая коллекция', '2026-10-05T09:30:00.000Z', null, 'Осень в магазине'),
  card('bez-daty', 'Без даты', null, 'https://s3.merfy.ru/b/3.jpg', ''),
];

const listOf = (items: ArticleCard[], pages = 1, page = 1): PageList => ({
  kind: 'articles',
  items,
  total: items.length,
  page,
  pages,
  perPage: 12,
  url: '/blogs/novosti',
  prev: page > 1 ? (page === 2 ? '/blogs/novosti' : `/blogs/novosti/page/${page - 1}`) : null,
  next: page < pages ? `/blogs/novosti/page/${page + 1}` : null,
  links: Array.from({ length: pages }, (_unused, index) => ({
    page: index + 1,
    url: index === 0 ? '/blogs/novosti' : `/blogs/novosti/page/${index + 1}`,
    current: index + 1 === page,
  })),
  query: {
    sort: null,
    minPrice: null,
    maxPrice: null,
    availability: null,
    collections: [],
    filters: {},
    q: null,
    page,
  },
  sorts: [],
  facets: null,
});
const blogPage = (list: PageList | undefined): PageInfo => ({
  id: 'blog',
  path: '/blogs/novosti',
  record: BLOG,
  ...(list === undefined ? {} : { list }),
});
const articlePage = (record: object | null): PageInfo => ({ id: 'article', path: '/blogs/novosti/kak-stirat', record });

let blog: RenderedSection;
let article: RenderedSection;
let page: RenderedSection;
beforeAll(async () => {
  [blog, article, page] = await Promise.all([renderSection('blog'), renderSection('article'), renderSection('page')]);
}, 90_000);
afterAll(async () => {
  await Promise.all([blog.close(), article.close(), page.close()]);
});

describe('«Блог»', () => {
  it('принимается без проблем и предупреждений', async () => {
    expect(await acceptanceProblems('blog')).toEqual([]);
  }, 60_000);

  it('панель: поля прода (отступы, схема), новые — после, «Содержание» и «Вид»', () => {
    expect(panelOf(blog.manifest)).toEqual([
      ['wrapper:padding', undefined, undefined],
      ['wrapper:scheme', undefined, undefined],
      ['per-page', 'Карточки', 'Содержание'],
      ['date', 'Дата и время', undefined],
      ['excerpt', 'Анонс', undefined],
      ['columns', 'Колонки', 'Вид'],
      ['align', 'Выравнивание заголовка', undefined],
    ]);
    expect(blog.manifest.wrapperSpec?.padding?.default).toEqual({ top: 80, bottom: 80 });
  });

  it('название блога — h1, записи — карточками со ссылкой, датой словами и анонсом', async () => {
    const html = await blog.html({ page: blogPage(listOf(CARDS)) });
    expect(html).toContain(`>${BLOG.title}</h1>`);
    expect(tags(html, 'a').map((tag) => attr(tag, 'href'))).toEqual([
      '/blogs/novosti/kak-stirat',
      '/blogs/novosti/novaya',
      '/blogs/novosti/bez-daty',
    ]);
    expect(html).toContain('>19 октября 2026 г.</time>');
    expect(html).toContain('Вручную, при 30°');
    // Запись без обложки — рамка без img; без даты — без времени.
    expect(tags(html, 'img')).toHaveLength(2);
    expect(tags(html, 'time')).toHaveLength(2);
    expect(html).not.toContain('Страницы блога');
  });

  it('«Дата и время» и «Анонс» скрывают свои строки', async () => {
    const html = await blog.html({ settings: { date: false, excerpt: false }, page: blogPage(listOf(CARDS)) });
    expect(tags(html, 'time')).toEqual([]);
    expect(html).not.toContain('Вручную, при 30°');
    expect(html).toContain('Как стирать плед');
  });

  it('колонки и выравнивание заголовка — признаками на корне', async () => {
    const html = await blog.html({ settings: { columns: 4, align: 'center' }, page: blogPage(listOf(CARDS)) });
    const root = tags(html, 'div')[0] ?? '';
    expect([attr(root, 'data-columns'), attr(root, 'data-align')]).toEqual(['4', 'center']);
  });

  it('записей нет — заголовок остаётся, вместо списка подсказка', async () => {
    const html = await blog.html({ page: blogPage(listOf([])) });
    expect(html).toContain(`>${BLOG.title}</h1>`);
    expect(html).toContain('В этом блоге пока нет записей');
    expect(tags(html, 'ul')).toEqual([]);
  });

  it('вне страницы блога — без заголовка и списка, подсказка', async () => {
    const html = await blog.html();
    expect(html).not.toContain('<h1');
    expect(html).toContain('В этом блоге пока нет записей');
  });

  it('несколько страниц — номера со ссылками, стрелка назад неактивна на первой', async () => {
    const html = await blog.html({ page: blogPage(listOf(CARDS, 3)) });
    expect(html).toContain('aria-label="Страницы блога"');
    expect(html).toContain('href="/blogs/novosti/page/2"');
    expect(html).toContain('href="/blogs/novosti/page/3"');
    expect(html).toContain('aria-label="Следующая страница"');
    expect(html).not.toContain('aria-label="Предыдущая страница"');
    expect(tags(html, 'a').filter((tag) => attr(tag, 'aria-current') === 'page')).toHaveLength(1);
  });

  it('вторая страница — стрелка назад ведёт на первую', async () => {
    const html = await blog.html({ page: blogPage(listOf(CARDS, 3, 2)) });
    const back = tags(html, 'a').find((tag) => attr(tag, 'aria-label') === 'Предыдущая страница') ?? '';
    expect(attr(back, 'href')).toBe('/blogs/novosti');
  });
});

describe('«Статья»', () => {
  it('принимается без проблем и предупреждений', async () => {
    expect(await acceptanceProblems('article')).toEqual([]);
  }, 60_000);

  it('панель — как у BlogPostSection на проде: отступы и цветовая схема', () => {
    expect(panelOf(article.manifest)).toEqual([
      ['wrapper:padding', undefined, undefined],
      ['wrapper:scheme', undefined, undefined],
    ]);
    expect(article.manifest.wrapperSpec?.padding?.default).toEqual({ top: 80, bottom: 80 });
  });

  it('ссылка на блог, заголовок, дата словами, обложка и текст', async () => {
    const html = await article.html({ page: articlePage({ ...ARTICLE, cover: 'https://s3.merfy.ru/b/1.jpg' }) });
    const back = tags(html, 'a')[0] ?? '';
    expect(attr(back, 'href')).toBe(ARTICLE.blog.url);
    expect(html).toContain(`← ${ARTICLE.blog.title}</a>`);
    expect(html).toContain(`>${ARTICLE.title}</h1>`);
    expect(html).toContain('>19 октября 2026 г.</time>');
    expect(attr(tags(html, 'img')[0] ?? '', 'src')).toBe('https://s3.merfy.ru/b/1.jpg');
    expect(html).toContain('<p>Стирать вручную</p>');
  });

  it('текст записи — в обёртке rich-text: подзаголовок, список и ссылка остаются в ней', async () => {
    const record = { ...ARTICLE, html: '<h2>Уход</h2><ul><li>Вручную</li></ul><p><a href="/care">Подробнее</a></p>' };
    const html = await article.html({ page: articlePage(record) });
    expect(html).toMatch(
      /<div class="rich-text [^"]*"><h2>Уход<\/h2><ul><li>Вручную<\/li><\/ul><p><a href="\/care">Подробнее<\/a><\/p><\/div>/,
    );
  });

  it('без обложки и без даты — без картинки и времени', async () => {
    const html = await article.html({
      page: articlePage({ ...ARTICLE, cover: null, publishedAt: null, publishedText: '' }),
    });
    expect(tags(html, 'img')).toEqual([]);
    expect(tags(html, 'time')).toEqual([]);
  });

  it('на странице записи без записи — подсказка, на других страницах — пусто', async () => {
    expect(await article.html({ page: articlePage(null) })).toContain('Здесь появится текст записи');
    expect(await article.html()).not.toContain('<h1');
  });
});

describe('«Страница»', () => {
  it('принимается без проблем и предупреждений', async () => {
    expect(await acceptanceProblems('page')).toEqual([]);
  }, 60_000);

  it('панель: выбор страницы, размер заголовка, схема, отступы — как на проде; свои заголовок и текст — после', () => {
    expect(panelOf(page.manifest)).toEqual([
      ['policy', 'Выбор страницы', undefined],
      ['heading-size', 'Размер заголовка', undefined],
      ['wrapper:scheme', undefined, undefined],
      ['wrapper:padding', undefined, undefined],
      ['heading', 'Заголовок', 'Содержание'],
      ['text', 'Текст', undefined],
    ]);
  });

  it.each(['small', 'medium', 'large'])('размер заголовка %s — признаком на корне', async (size) => {
    const html = await page.html({ settings: { 'heading-size': size } });
    expect(attr(tags(html, 'div')[0] ?? '', 'data-heading-size')).toBe(size);
  });

  it('по умолчанию — средний заголовок, свой заголовок и текст', async () => {
    const html = await page.html();
    expect(attr(tags(html, 'div')[0] ?? '', 'data-heading-size')).toBe('medium');
    expect(html).toContain('>Страница</h1>');
    expect(html).toContain('<p>Расскажите покупателям, о чём эта страница.</p>');
  });

  it('текст — в обёртке rich-text: своя страница и политика', async () => {
    const own = await page.html({ settings: { text: '<h2>Доставка</h2><ul><li>СДЭК</li></ul>' } });
    expect(own).toMatch(/<div class="rich-text [^"]*"><h2>Доставка<\/h2><ul><li>СДЭК<\/li><\/ul><\/div>/);
    const policy = await page.html({ settings: { policy: 'privacy' }, records: { policy: POLICY } });
    expect(policy).toMatch(/<div class="rich-text [^"]*"><p>Мы бережём данные<\/p><\/div>/);
  });

  it('выбрана политика — её название и текст вместо своих', async () => {
    const html = await page.html({ settings: { policy: 'privacy' }, records: { policy: POLICY } });
    expect(html).toContain(`>${POLICY.title}</h1>`);
    expect(html).toContain('<p>Мы бережём данные</p>');
    expect(html).not.toContain('Расскажите покупателям');
  });
});
