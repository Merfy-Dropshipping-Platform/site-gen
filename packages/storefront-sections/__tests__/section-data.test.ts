import { describe, expect, it } from 'vitest';
import { readManifest } from '../src/format';
import { prepareSection } from '../src/prepare';
import { dataProblems, dataUnknownProblems, sectionRecordKeys } from '../src/section-data';

// data секции для скрипта (блок 8 «Секций и SDK», часть 8г; Р8г-6): имя → { from, fields } — поля записи страницы или
// поля с записью этой секции; только публичные поля вида; ctx.data.<имя> — только объявленное.
const SETTINGS = [
  { id: 'product', label: 'Выбор товара', setting: { kind: 'product' } },
  { id: 'collection', label: 'Выбор коллекции', setting: { kind: 'collection' } },
  { id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'Шарфы' } },
  {
    id: 'price',
    label: 'Стоимость',
    setting: { kind: 'hint', title: 'Настройка недоступна', text: 'Изменения проводятся на странице' },
  },
];
const manifestOf = (data: unknown) => ({
  sdk: 1,
  name: 'product-card',
  kind: 'section',
  title: 'Карточка товара',
  settings: SETTINGS,
  data,
});
const textOf = (data: unknown): string => JSON.stringify(manifestOf(data), null, 2);
function parsed(data: unknown) {
  const result = readManifest({ 'section.json': textOf(data) });
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.value;
}
const problemsOf = (data: unknown): string[] => {
  const result = readManifest({ 'section.json': textOf(data) });
  return result.ok ? [] : result.problems.map((item) => `${item.code} ${item.message}`).sort();
};
const PRODUCT_FIELDS =
  'id, title, slug, url, description, price, compareAtPrice, images, available, preorder, options, variants, ' +
  'collections, updatedAt';
const FROM_KINDS = 'from: page.record или settings.<id поля вида product, collection, blog или policy>';

describe('data секции', () => {
  it('публичные поля записи страницы и полей с записью — проблем нет', () => {
    const data = {
      product: { from: 'settings.product', fields: ['id', 'title', 'price', 'variants'] },
      scarfs: { from: 'settings.collection', fields: ['title', 'products'] },
      page: { from: 'page.record', fields: ['title', 'html', 'articles'] },
    };
    expect(dataProblems(parsed(data), textOf(data))).toEqual([]);
  });

  it('не публичное поле — data-field-private с местом в section.json и списком публичных', () => {
    const data = { product: { from: 'settings.product', fields: ['id', 'costPrice', 'sku'] } };
    const text = textOf(data);
    const lines = text.split('\n');
    const at = (value: string) => {
      const line = lines.findIndex((item) => item.includes(`"${value}"`));
      return { line: line + 1, column: (lines[line] ?? '').indexOf(`"${value}"`) + 1 };
    };
    const owner = `не публичное поле товара. Публичные: ${PRODUCT_FIELDS}`;
    expect(dataProblems(parsed(data), text)).toEqual([
      {
        code: 'data-field-private',
        file: 'section.json',
        ...at('costPrice'),
        message: `data.product.fields.1: «costPrice» — ${owner}`,
      },
      {
        code: 'data-field-private',
        file: 'section.json',
        ...at('sku'),
        message: `data.product.fields.2: «sku» — ${owner}`,
      },
    ]);
  });

  it('from — не поле с записью этой секции: manifest-invalid', () => {
    const data = {
      title: { from: 'settings.heading', fields: ['title'] },
      cost: { from: 'settings.price', fields: ['amount'] },
      other: { from: 'settings.cart', fields: ['id'] },
    };
    expect(dataProblems(parsed(data), textOf(data)).map((item) => `${item.code} ${item.message}`)).toEqual([
      `manifest-invalid data.title.from: у секции нет поля с записью «heading» — ${FROM_KINDS}`,
      `manifest-invalid data.cost.from: у секции нет поля с записью «price» — ${FROM_KINDS}`,
      `manifest-invalid data.other.from: у секции нет поля с записью «cart» — ${FROM_KINDS}`,
    ]);
  });

  it('форма: имя, from, пустой и повторный fields, больше 10 имён', () => {
    expect(problemsOf({ 'main-photo': { from: 'page.record', fields: ['id'] } })).toEqual([
      'manifest-invalid data.main-photo: имя — латинские буквы и цифры, первая — строчная: product',
    ]);
    expect(
      problemsOf({ ok: { from: 'cart.items', fields: [] }, twice: { from: 'page.record', fields: ['id', 'id'] } }),
    ).toEqual([
      expect.stringMatching(/^manifest-invalid data\.ok\.fields: /),
      'manifest-invalid data.ok.from: from — page.record или settings.<id поля с записью>',
      'manifest-invalid data.twice.fields: поле дважды',
    ]);
    const many = Object.fromEntries(
      Array.from({ length: 11 }, (_, n) => [`n${n}`, { from: 'page.record', fields: ['id'] }]),
    );
    expect(problemsOf(many)).toEqual(['manifest-invalid data: не больше 10 имён']);
  });

  it('ctx.data.<имя> без объявления — data-unknown на месте чтения', () => {
    const reads = [
      { path: ['data', 'product'], file: 'script.ts', line: 3, column: 14 },
      { path: ['data', 'scarfs'], file: 'script.ts', line: 4, column: 14 },
      { path: ['settings', 'heading'], file: 'script.ts', line: 5, column: 9 },
      { path: ['data'], file: 'script.ts', line: 6, column: 9 },
    ];
    const declared = parsed({ product: { from: 'settings.product', fields: ['id'] } });
    expect(dataUnknownProblems(declared, reads)).toEqual([
      {
        code: 'data-unknown',
        file: 'script.ts',
        line: 4,
        column: 14,
        message: 'ctx.data.scarfs: такого имени нет в data section.json. Есть: product',
      },
    ]);
    expect(dataUnknownProblems(parsed(undefined), reads).map((item) => item.message)).toEqual([
      'ctx.data.product: такого имени нет в data section.json — data не объявлен',
      'ctx.data.scarfs: такого имени нет в data section.json — data не объявлен',
    ]);
  });

  it('ключи кода секции: recordFields без подсказки и data; у секции без них — пусто', () => {
    const data = { product: { from: 'settings.product', fields: ['id', 'title'] } };
    expect(sectionRecordKeys(parsed(data))).toEqual({
      recordFields: { product: 'product', collection: 'collection' },
      data,
    });
    const plain = readManifest({
      'section.json': JSON.stringify({ sdk: 1, name: 'hero', kind: 'section', title: 'Первый экран', settings: [] }),
    });
    if (!plain.ok) throw new Error(JSON.stringify(plain.problems));
    expect(sectionRecordKeys(plain.value)).toEqual({});
  });

  it('приём: не публичное поле в data — отказ секции', async () => {
    const data = { product: { from: 'settings.product', fields: ['costPrice'] } };
    const files = { 'section.json': textOf(data), 'template.astro': '<p class="m-0">Карточка</p>' };
    const result = await prepareSection({ prefix: 'shop', files });
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['data-field-private']);
  });
});

describe('ctx.data в скрипте секции (часть 5в-2)', () => {
  it('имя не из data — отказ data-unknown на месте чтения', async () => {
    const data = { product: { from: 'settings.product', fields: ['id', 'title'] } };
    const script = [
      "import { defineSection } from '@merfy/shell';",
      'export default defineSection({',
      '  mount(_el, ctx) {',
      '    ctx.log(ctx.data.product, ctx.data.scarfs);',
      '  },',
      '});',
      '',
    ].join('\n');
    const files = {
      'section.json': textOf(data),
      'template.astro': '<p class="m-0">Карточка</p>',
      'script.ts': script,
    };
    const result = await prepareSection({ prefix: 'shop', files });
    expect(result.ok ? [] : result.problems.map((item) => [item.code, item.file, item.line, item.message])).toEqual([
      ['data-unknown', 'script.ts', 4, 'ctx.data.scarfs: такого имени нет в data section.json. Есть: product'],
    ]);
  });
});
