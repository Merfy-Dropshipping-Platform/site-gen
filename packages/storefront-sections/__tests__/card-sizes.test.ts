import { fileURLToPath } from 'node:url';
import { SAMPLE_PAGES, sampleRecord, sha256 } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import type { SectionValue } from '../src/fields';
import { readManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// Копии картинок (модуль картинок, шаг 3): у картинки карточки базовых секций с сеткой товаров свой sizes по числу колонок
// (телефон: одна или две, md: до трёх, lg: выбранное число). Без него браузер на компьютере взял бы для карточки копию на
// всю ширину (1600), а не на колонку (800). Проверка — по HTML, который рисует процесс рендера; srcset ставит сборка
// магазина (storefront-build, image-sizes.ts), в шаблоне его нет.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
const CARDS = 5;

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

function pageOf(id: 'catalog' | 'collection') {
  const page = SAMPLE_PAGES.find((item) => item.id === id);
  const list = page?.list;
  if (page === undefined || list?.kind !== 'products')
    throw new Error(`в примерах нет списка товаров у страницы ${id}`);
  return { ...page, list: { ...list, items: products, total: CARDS } };
}

// sizes у картинок карточек по порядку: у каждой карточки одна картинка с её адресом в src.
function cardSizes(html: string): Array<string | undefined> {
  const images = [...html.matchAll(/<img\b[^>]*\bsrc="https:\/\/s3\.merfy\.ru\/p\/card-\d+\.jpg"[^>]*>/g)];
  return images.map((match) => /\bsizes="([^"]*)"/.exec(match[0])?.[1]);
}

const same = (sizes: string): string[] => Array.from({ length: CARDS }, () => sizes);

// Настройки колонок → sizes: телефон — 100/N vw, md — не больше трёх колонок, lg — выбранное число; доли округляются вверх.
const GRIDS: Array<{ title: string; settings: Record<string, SectionValue>; sizes: string }> = [
  {
    title: 'по умолчанию (колонок 3 у каталога и коллекции, две на телефоне)',
    settings: {},
    sizes: '(max-width: 767px) 50vw, (max-width: 1023px) 34vw, 34vw',
  },
  {
    title: 'четыре колонки, одна на телефоне',
    settings: { columns: 4, 'columns-mobile': '1' },
    sizes: '(max-width: 767px) 100vw, (max-width: 1023px) 34vw, 25vw',
  },
  {
    title: 'шесть колонок',
    settings: { columns: 6, 'columns-mobile': '2' },
    sizes: '(max-width: 767px) 50vw, (max-width: 1023px) 34vw, 17vw',
  },
  { title: 'две колонки', settings: { columns: 2 }, sizes: '(max-width: 767px) 50vw, (max-width: 1023px) 50vw, 50vw' },
  {
    title: 'одна колонка',
    settings: { columns: 1, 'columns-mobile': '1' },
    sizes: '(max-width: 767px) 100vw, (max-width: 1023px) 100vw, 100vw',
  },
];

describe('карточки сеток товаров: свой sizes по числу колонок', () => {
  describe.each(['catalog', 'collection'] as const)('«%s»', (name) => {
    it.each(GRIDS)(
      '$title',
      async ({ settings, sizes }) => {
        const html = await renderer.render({ ...(await requestOf(name)), settings, page: pageOf(name) });
        expect(cardSizes(html)).toEqual(same(sizes));
      },
      30_000,
    );
  });

  describe('«Коллекция товаров»', () => {
    it('четыре колонки (умолчание section.json) и две на телефоне', async () => {
      const html = await renderer.render({
        ...(await requestOf('collection-products')),
        settings: { collection: 'pledy', cards: CARDS, columns: 4 },
        records: { collection: COLLECTION },
      });
      expect(cardSizes(html)).toEqual(same('(max-width: 767px) 50vw, (max-width: 1023px) 34vw, 25vw'));
    }, 30_000);

    it('колонки и телефон из настроек', async () => {
      const html = await renderer.render({
        ...(await requestOf('collection-products')),
        settings: { collection: 'pledy', cards: CARDS, columns: 5, 'columns-mobile': '1' },
        records: { collection: COLLECTION },
      });
      expect(cardSizes(html)).toEqual(same('(max-width: 767px) 100vw, (max-width: 1023px) 34vw, 20vw'));
    }, 30_000);
  });
});
