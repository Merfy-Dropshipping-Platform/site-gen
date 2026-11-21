import { fileURLToPath } from 'node:url';
import { SAMPLE_PAGES, sampleRecord, sha256 } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// Загрузка картинок карточек товаров (19.11.2026: LCP каталога и коллекции — вторая карточка сетки, а она была lazy):
// шаблон главнее сборки, поэтому первые четыре карточки базовых секций с сеткой товаров eager прямо в шаблоне, остальные
// lazy. Проверка — по HTML, который рисует процесс рендера.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
const CARDS = 8;
const EAGER_CARDS = 4;

const product = (position: number) => {
  const [first] = sampleRecord('collection').products;
  if (first === undefined) throw new Error('в примерах нет товаров');
  const image = `https://s3.merfy.ru/p/card-${position}.jpg`;
  const details = { badges: [], discountPercent: null, stockLeft: null, tags: [] };
  return { ...first, ...details, id: `p-${position}`, image, images: [image], hasVariants: false };
};
const products = Array.from({ length: CARDS }, (_, position) => product(position));
const COLLECTION = { ...sampleRecord('collection'), products, productsCount: CARDS };

let renderer: SectionRenderer;
beforeAll(() => {
  renderer = startSectionRenderer();
});
afterAll(async () => {
  await renderer.close();
});

async function requestOf(name: string) {
  const files = await readSectionFolder(`${SHOP}/${name}`);
  const manifest = readManifest(files);
  if (!manifest.ok) throw new Error(JSON.stringify(manifest.problems));
  const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest.value));
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  return { section: `shop:${name}`, hash: sha256(Buffer.from(checked.render, 'utf8')), module: checked.render };
}

// Страница со списком из восьми карточек: список страницы берётся у страницы примеров, карточки подменяются.
function pageOf(id: 'catalog' | 'collection') {
  const page = SAMPLE_PAGES.find((item) => item.id === id);
  const list = page?.list;
  if (page === undefined || list?.kind !== 'products')
    throw new Error(`в примерах нет списка товаров у страницы ${id}`);
  return { ...page, list: { ...list, items: products, total: CARDS } };
}

// Загрузка у картинок карточек по порядку: у каждой карточки одна картинка с её адресом в src.
function cardLoadings(html: string): Array<string | undefined> {
  const images = [...html.matchAll(/<img\b[^>]*\bsrc="https:\/\/s3\.merfy\.ru\/p\/card-\d+\.jpg"[^>]*>/g)];
  return images.map((match) => /\bloading="([^"]*)"/.exec(match[0])?.[1]);
}

const EXPECTED = Array.from({ length: CARDS }, (_, position) => (position < EAGER_CARDS ? 'eager' : 'lazy'));

describe('базовые секции с сеткой товаров: первые четыре карточки eager, остальные lazy', () => {
  it.each(['catalog', 'collection'] as const)(
    '«%s»: карточки списка страницы',
    async (name) => {
      const html = await renderer.render({ ...(await requestOf(name)), settings: {}, page: pageOf(name) });
      expect(cardLoadings(html)).toEqual(EXPECTED);
    },
    30_000,
  );

  it('«Коллекция товаров»: карточки выбранной коллекции', async () => {
    const html = await renderer.render({
      ...(await requestOf('collection-products')),
      settings: { collection: 'pledy', cards: CARDS },
      records: { collection: COLLECTION },
    });
    expect(cardLoadings(html)).toEqual(EXPECTED);
  }, 30_000);

  it('«Коллекция товаров»: число карточек меньше четырёх — все eager', async () => {
    const html = await renderer.render({
      ...(await requestOf('collection-products')),
      settings: { collection: 'pledy', cards: 3 },
      records: { collection: COLLECTION },
    });
    expect(cardLoadings(html)).toEqual(['eager', 'eager', 'eager']);
  }, 30_000);
});
