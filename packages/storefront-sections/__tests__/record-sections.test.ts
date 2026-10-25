import { fileURLToPath } from 'node:url';
import {
  money,
  sha256,
  type ArticleCard,
  type ArticleRecord,
  type BlogRecord,
  type CollectionRecord,
  type PolicyRecord,
  type ProductCard,
  type ProductRecord,
} from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// Наши секции с полями с записями (блок 8 «Секций и SDK», часть 8г-2; design.md 8.10, Р8г-10): «Товар», «Коллекция»,
// «Блог», «Статья» и «Выбор страницы» у «Страницы». Проверка их принимает без предупреждений, процесс рендера
// показывает записи; пустые значения — как у секций пяти тем на проде.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
const AT = '2026-10-20T10:00:00.000Z';
const PRODUCT = {
  id: 'p-2',
  title: 'Плед «Нова»',
  slug: 'pled',
  url: '/product/pled',
  description: 'Тёплый и мягкий',
  price: money(350000),
  compareAtPrice: money(420000),
  images: ['https://s3.merfy.ru/p/2.jpg'],
  available: true,
  options: [],
  variants: [],
  collections: [],
  updatedAt: AT,
} satisfies ProductRecord;
const CARD = {
  id: 'p-2',
  title: 'Плед «Нова»',
  url: '/product/pled',
  price: money(350000),
  compareAtPrice: null,
  image: 'https://s3.merfy.ru/p/2.jpg',
  available: true,
} satisfies ProductCard;
const COLLECTION = {
  id: 'c-1',
  title: 'Пледы',
  slug: 'pledy',
  url: '/collections/pledy',
  description: 'Для холодных вечеров',
  images: [],
  productsCount: 1,
  products: [CARD],
} satisfies CollectionRecord;
const POST = {
  id: 'a-1',
  title: 'Как стирать плед',
  url: '/blogs/novosti/kak-stirat',
  publishedAt: '2026-10-19T10:00:00.000Z',
  cover: null,
  excerpt: 'Вручную, при 30°',
} satisfies ArticleCard;
const BLOG = {
  id: 'b-1',
  title: 'Новости',
  handle: 'novosti',
  url: '/blogs/novosti',
  articlesCount: 1,
  articles: [POST],
} satisfies BlogRecord;
const ARTICLE = {
  ...POST,
  slug: 'kak-stirat',
  html: '<p>Стирать вручную</p>',
  blog: { title: 'Новости', url: '/blogs/novosti' },
} satisfies ArticleRecord;
const POLICY = {
  type: 'privacy',
  title: 'Политика конфиденциальности',
  url: '/legal/privacy',
  html: '<p>Мы бережём данные</p>',
} satisfies PolicyRecord;

const opened: SectionRenderer[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

async function requestOf(name: string) {
  const files = await readSectionFolder(`${SHOP}/${name}`);
  const manifest = readManifest(files);
  if (!manifest.ok) throw new Error(JSON.stringify(manifest.problems));
  const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest.value));
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  return { section: `shop:${name}`, hash: sha256(Buffer.from(checked.render, 'utf8')), module: checked.render };
}

function rendererOf(): SectionRenderer {
  const renderer = startSectionRenderer();
  opened.push(renderer);
  return renderer;
}

describe('наши секции с записями', () => {
  it.each(['product', 'collection', 'blog', 'article', 'page'])(
    '%s — проверка проходит без предупреждений',
    async (name) => {
      const result = await prepareInWorker({ prefix: 'shop', files: await readSectionFolder(`${SHOP}/${name}`) });
      expect(result.ok ? result.section.warnings : result.problems).toEqual([]);
    },
    30_000,
  );

  it('«Товар»: название, цена, старая цена, наличие; товара нет — пусто', async () => {
    const renderer = rendererOf();
    const request = await requestOf('product');
    const settings = { product: 'pled', price: null };
    const html = await renderer.render({ ...request, settings, records: { product: PRODUCT } });
    expect(html).toContain('Плед «Нова»');
    expect(html).toContain(money(350000).text);
    expect(html).toContain(`<s class="ml-2 text-base">${money(420000).text}</s>`);
    expect(html).toContain('В наличии');
    expect(await renderer.render({ ...request, settings, records: { product: null } })).not.toContain('<h1');
  }, 30_000);

  it('«Коллекция»: название и карточки товаров; «все товары» — без заголовка', async () => {
    const renderer = rendererOf();
    const request = await requestOf('collection');
    const html = await renderer.render({
      ...request,
      settings: { collection: 'pledy' },
      records: { collection: COLLECTION },
    });
    expect(html).toContain('Пледы');
    expect(html).toContain('<a class="text-foreground no-underline" href="/product/pled">Плед «Нова»</a>');
    const all = { ...COLLECTION, id: '', title: '', slug: '', url: '', description: '' };
    const allHtml = await renderer.render({ ...request, settings: { collection: null }, records: { collection: all } });
    expect(allHtml).not.toContain('<h1');
    expect(allHtml).toContain('href="/product/pled"');
  }, 30_000);

  it('«Блог»: записи со ссылкой и анонсом', async () => {
    const renderer = rendererOf();
    const request = await requestOf('blog');
    const html = await renderer.render({ ...request, settings: { posts: null }, records: { posts: BLOG } });
    expect(html).toContain('href="/blogs/novosti/kak-stirat"');
    expect(html).toContain('Вручную, при 30°');
  }, 30_000);

  it('«Статья»: на странице статьи — заголовок, дата и текст; на других страницах — пусто', async () => {
    const renderer = rendererOf();
    const request = await requestOf('article');
    const page = { id: 'article', path: ARTICLE.url, record: ARTICLE };
    const html = await renderer.render({ ...request, settings: {}, page });
    expect(html).toContain('<p>Стирать вручную</p>');
    expect(html).toContain('2026-10-19');
    expect(await renderer.render({ ...request, settings: {} })).not.toContain('<article');
  }, 30_000);

  it('«Страница»: выбрана политика — её название и текст; пусто — свой заголовок и текст', async () => {
    const renderer = rendererOf();
    const request = await requestOf('page');
    const own = { policy: null, heading: 'О нас', text: '<p>Мы шьём пледы</p>' };
    const chosen = await renderer.render({
      ...request,
      settings: { ...own, policy: 'privacy' },
      records: { policy: POLICY },
    });
    expect(chosen).toContain('Политика конфиденциальности');
    expect(chosen).toContain('<p>Мы бережём данные</p>');
    expect(chosen).not.toContain('Мы шьём пледы');
    const plain = await renderer.render({ ...request, settings: own, records: { policy: null } });
    expect(plain).toContain('О нас');
    expect(plain).toContain('<p>Мы шьём пледы</p>');
  }, 30_000);
});
