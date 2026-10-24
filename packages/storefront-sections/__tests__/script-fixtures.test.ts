import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prepareSection, type PrepareResult } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';

// Секции со скриптом при сохранении (блок 5 «Секций и SDK», часть 5в; раздел 8 design.md, п. 4): фикстуры пакета,
// «Подбор шарфа» и «Значок корзины» проходят «только SDK» и сверку имён; script_meta — по uses, разметке и toggleClass.
// Сломанные секции — каждая ошибка с кодом и местом.
const FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));
const OUR_SECTIONS = fileURLToPath(new URL('../../storefront-shell/sections', import.meta.url));
const prepared = async (folder: string): Promise<PrepareResult> =>
  prepareSection({ prefix: 'shop', files: await readSectionFolder(folder) });
const places = (result: PrepareResult): string[] =>
  result.ok ? [] : result.problems.map((item) => `${item.code} ${item.file}:${item.line}:${item.column}`);
const NONE = { uses: [], parts: [], classes: [] };

describe('скрипты фикстур при сохранении', () => {
  it.each([
    [`${FIXTURES}/sections/geo-locate`, NONE],
    [`${FIXTURES}/sections/reviews-list`, { uses: ['cart'], parts: ['cart'], classes: [] }],
    [`${FIXTURES}/sections/shop-color-match`, NONE],
    [`${FIXTURES}/sections/theme-scarf-colors`, NONE],
    [
      `${FIXTURES}/scripts/scarf-match`,
      { uses: [], parts: ['cart'], classes: ['bg-primary', 'text-primary-foreground'] },
    ],
  ])('%s — принята, в модуле нет импорта, script_meta по коду', async (folder, meta) => {
    const result = await prepared(folder);
    expect(places(result)).toEqual([]);
    expect(result.ok && result.section.scriptMeta).toEqual(meta);
    expect(result.ok && result.section.script).not.toContain('@merfy/shell');
  });

  // Шаблон значка — из 5б, его классы проверяет шаг «Классы» 4а; здесь — только скрипт и uses.
  it('«Значок корзины» — uses: ["cart"], модуль без импорта', async () => {
    const files = await readSectionFolder(`${OUR_SECTIONS}/cart-badge`);
    const template = '<a href="/cart">Корзина <span data-ref="count">0</span></a>';
    const result = await prepareSection({ prefix: 'shop', files: { ...files, 'template.astro': template } });
    expect(places(result)).toEqual([]);
    expect(result.ok && result.section.scriptMeta).toEqual({ uses: ['cart'], parts: ['cart'], classes: [] });
  });

  it.each([
    ['sections/shop-broken', ['script-invalid script.ts:3:11']],
    ['sections/bad-import', ['import-forbidden script.ts:1:22']],
    [
      'broken/script-sdk-only',
      [
        'sdk-only script.ts:6:5',
        'sdk-only script.ts:7:23',
        'sdk-only script.ts:7:35',
        'sdk-only script.ts:8:22',
        'sdk-only script.ts:9:5',
      ],
    ],
    [
      'broken/script-names',
      [
        'event-unknown script.ts:6:16',
        'action-unknown template.astro:2:38',
        'action-unknown template.astro:3:38',
        'action-unknown template.astro:4:38',
        'action-unknown template.astro:5:22',
      ],
    ],
  ])('%s — отказ с местом каждой ошибки', async (folder, expected) => {
    expect(places(await prepared(`${FIXTURES}/${folder}`))).toEqual(expected);
  });
});
