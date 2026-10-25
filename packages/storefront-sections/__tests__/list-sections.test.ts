import { fileURLToPath } from 'node:url';
import { EMPTY_LIST_QUERY, money, sha256, type ListProductCard, type PageList } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// Наши секции блока 11 «Секций и SDK» (часть 11б-2; design.md 11.10, Р11б-21): «Каталог», «Поиск», «Товар» с
// вариантами и «Шапка» с кнопкой поиска проходят проверку без предупреждений; «Каталог» рисует список страницы с
// частями поведения catalog. В тест-магазин их ставит основной тред способом мерчанта (план 11в).
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
const CARD = {
  id: 'p-1',
  title: 'Шарф «Нова»',
  url: '/product/sharf-nova',
  price: money(190000),
  compareAtPrice: null,
  image: 'https://s3.merfy.ru/p/1.jpg',
  available: true,
  images: ['https://s3.merfy.ru/p/1.jpg', 'https://s3.merfy.ru/p/2.jpg'],
  variantId: 'v-1',
  hasVariants: true,
} satisfies ListProductCard;
const LIST = {
  kind: 'products',
  items: [CARD],
  total: 3,
  page: 1,
  pages: 2,
  perPage: 2,
  url: '/catalog',
  prev: null,
  next: '/catalog/page/2',
  links: [
    { page: 1, url: '/catalog', current: true },
    { page: 2, url: '/catalog/page/2', current: false },
  ],
  query: EMPTY_LIST_QUERY,
  sorts: [
    { value: 'newest', label: 'Новые', selected: true },
    { value: 'price_asc', label: 'Цена по возрастанию', selected: false },
  ],
  facets: {
    price: { min: money(190000), max: money(350000) },
    groups: [{ key: 'цвет', name: 'Цвет', values: [{ value: 'Синий', selected: false }] }],
    collections: [],
  },
} satisfies PageList;

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

describe('наши секции блока 11', () => {
  it.each(['catalog', 'search', 'product', 'header'])(
    '%s — проверка проходит без предупреждений',
    async (name) => {
      const result = await prepareInWorker({ prefix: 'shop', files: await readSectionFolder(`${SHOP}/${name}`) });
      expect(result.ok ? result.section.warnings : result.problems).toEqual([]);
    },
    30_000,
  );

  it('«Каталог»: поведение catalog с «Как листать», строки, «Показать ещё», номера, фото и «В корзину»', async () => {
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const request = await requestOf('catalog');
    const settings = {
      collection: null,
      'per-page': 2,
      columns: 3,
      paging: 'more',
      'next-photo': true,
      'quick-add': 'button',
    };
    const html = await renderer.render({ ...request, settings, page: { id: 'catalog', path: '/catalog', list: LIST } });
    expect(html).toContain('data-behavior="catalog" data-paging="more"');
    expect(html).toContain('data-part="list" data-page="1"');
    expect(html).toContain('data-part="next" href="/catalog/page/2"');
    expect(html).toContain('<span data-part="count">1</span>');
    expect(html).toContain('data-photos="https://s3.merfy.ru/p/1.jpg https://s3.merfy.ru/p/2.jpg"');
    expect(html).toContain('data-action="cart.add" data-product-id="p-1" data-variant-id="v-1"');
    expect(await renderer.render({ ...request, settings, page: { id: 'home', path: '/' } })).not.toContain(
      'data-part="list"',
    );
  }, 30_000);
});
