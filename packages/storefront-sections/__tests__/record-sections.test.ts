import { fileURLToPath } from 'node:url';
import { money, sampleRecord, sha256, type RenderBlock } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';
import { CODE_TASTE_CODES } from '../src/taste-code';

// Наши секции с полями с записями (блок 8 «Секций и SDK», часть 8г-2; design.md 8.10, Р8г-10): «Товар», «Коллекция»,
// «Блог», «Статья» и «Выбор страницы» у «Страницы». Проверка их принимает без предупреждений, процесс рендера
// показывает записи; пустые значения — как у секций пяти тем на проде.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
// Записи — примеры магазина из storefront-build (section-samples.ts), те же, что у пробного рендера при сохранении.
const PRODUCT = sampleRecord('product');
const COLLECTION = sampleRecord('collection');
const BLOG = sampleRecord('blog');
const ARTICLE = sampleRecord('article');
const POLICY = sampleRecord('policy');

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
      // Предупреждения кода шаблона (taste-code.ts) пока не в счёт: секции переписывает отдельная задача.
      const warnings = result.ok ? result.section.warnings.filter((item) => !CODE_TASTE_CODES.has(item.code)) : [];
      expect(result.ok ? warnings : result.problems).toEqual([]);
    },
    30_000,
  );

  it('«Товар»: название, цена, старая цена, наличие; товара нет — пусто', async () => {
    const renderer = rendererOf();
    const request = await requestOf('product');
    const settings = { product: 'pled', stock: true };
    // Название — блок «Название», цена и наличие — блок «Стоимость»: блоки по умолчанию ставит платформа, тест даёт их сам.
    const blocks: readonly RenderBlock[] = [
      { id: 'title-1', type: 'title', settings: { 'heading-size': 'medium' } },
      { id: 'price-2', type: 'price', settings: { price: null } },
    ];
    const html = await renderer.render({ ...request, settings, blocks, records: { product: PRODUCT } });
    expect(html).toContain('Плед «Нова»');
    expect(html).toContain(money(350000).text);
    expect(html).toContain(`<s class="text-base text-price-old" data-ref="compare">${money(420000).text}</s>`);
    expect(html).toContain('В наличии');
    expect(await renderer.render({ ...request, settings, blocks, records: { product: null } })).not.toContain('<h1');
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
    expect(html).toMatch(/<a class="[^"]*" href="\/product\/pled">Плед «Нова»<\/a>/);
    const all = { ...COLLECTION, id: '', title: '', slug: '', url: '', description: '' };
    const allHtml = await renderer.render({ ...request, settings: { collection: null }, records: { collection: all } });
    expect(allHtml).not.toContain('<h1');
    expect(allHtml).toContain('href="/product/pled"');
  }, 30_000);

  it('«Блог»: записи страницы блога — по списку страницы, со ссылкой и анонсом', async () => {
    const renderer = rendererOf();
    const request = await requestOf('blog');
    const articles = BLOG.articles;
    const list = {
      kind: 'articles' as const,
      items: articles,
      total: articles.length,
      totalLabel: `${articles.length} статей`,
      page: 1,
      pages: 1,
      perPage: 12,
      url: BLOG.url,
      prev: null,
      next: null,
      links: [],
      query: { sort: null, minPrice: null, maxPrice: null, availability: null, collections: [], filters: {}, q: null, page: 1 },
      sorts: [],
      facets: null,
    };
    const page = { id: 'blog', path: BLOG.url, record: BLOG, list };
    const html = await renderer.render({ ...request, settings: { excerpt: true }, page });
    expect(html).toContain('href="/blogs/novosti/kak-stirat"');
    expect(html).toContain('Вручную, при 30°');
  }, 30_000);

  it('«Статья»: на странице статьи — заголовок, дата и текст; на других страницах — пусто', async () => {
    const renderer = rendererOf();
    const request = await requestOf('article');
    const page = { id: 'article', path: ARTICLE.url, record: ARTICLE };
    const html = await renderer.render({ ...request, settings: {}, page });
    expect(html).toContain('<p>Стирать вручную</p>');
    expect(html).toContain('19 октября 2026 г.');
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
