import { parse } from '@astrojs/compiler-rs';
import { EXT_POINT_CLASSES, EXT_POINT_PARTS, EXT_POINTS } from '@merfy/shell/ext-points';
import { describe, expect, it } from 'vitest';
import type { SectionManifest } from '../src/format';
import { scriptMetaOf, scriptMetaSchema } from '../src/script-meta';
import { SCRIPT_CLASS } from '../src/script-names';
import { NO_MARKUP, templateMarkup } from '../src/template-markup';

// Места блоков расширений (блок 12 «Секций и SDK», часть 12б, В12-2 А): data-ext-point в шаблоне — часть ядра в
// script_meta.parts и её классы в script_meta.classes.
const markupOf = async (text: string) => templateMarkup((await Promise.resolve(parse(text))).ast, text);
const MANIFEST: SectionManifest = { sdk: 1, name: 'cart', kind: 'section', title: 'Корзина', settings: [] };

describe('data-ext-point в разметке', () => {
  it('места строкой — с местом в шаблоне; значение из выражения — нет', async () => {
    const text = '<div>\n  <div data-ext-point="cart"></div>\n  <div data-ext-point={x}></div>\n</div>';
    expect(await markupOf(text)).toEqual({ actions: [], points: [{ name: 'cart', line: 2, column: 24 }] });
  });

  it('шаблон без мест — ключа points нет', async () => {
    expect(await markupOf('<button data-action="cart.add">В корзину</button>')).toEqual({
      actions: [{ name: 'cart.add', line: 1, column: 22 }],
    });
  });
});

describe('script_meta мест', () => {
  it('место cart — часть points и её классы; без скрипта', async () => {
    const meta = scriptMetaOf(MANIFEST, await markupOf('<div data-ext-point="cart"></div>'), null);
    expect(meta).toEqual({ uses: [], parts: ['points'], classes: [...EXT_POINT_CLASSES.points] });
    expect(scriptMetaSchema.safeParse(meta).success).toBe(true);
  });

  it('cart и account — одна часть points, классы без повторов; orders — records, product — purchase', async () => {
    const text =
      '<div><div data-ext-point="cart"></div><div data-ext-point="account"></div>' +
      '<div data-ext-point="orders"></div><div data-ext-point="product"></div></div>';
    const meta = scriptMetaOf(MANIFEST, await markupOf(text), null);
    expect(meta.parts).toEqual(['points', 'purchase', 'records']);
    expect(new Set(meta.classes).size).toBe(meta.classes.length);
    expect(meta.classes).toEqual([...EXT_POINT_CLASSES.points]);
  });

  it('незнакомое место — части нет', async () => {
    const meta = scriptMetaOf(MANIFEST, await markupOf('<div data-ext-point="wishlist"></div>'), null);
    expect(meta.parts).toEqual([]);
    expect(meta.classes).toEqual([]);
  });

  it('без разметки — как раньше', () => {
    expect(scriptMetaOf(MANIFEST, NO_MARKUP, null)).toEqual({ uses: [], parts: [], classes: [] });
  });
});

describe('данные мест', () => {
  it('каждое место — часть из EXT_POINT_PARTS; имя части — по правилу частей бандла', () => {
    for (const part of Object.values(EXT_POINTS)) expect(EXT_POINT_PARTS).toContain(part);
    for (const part of EXT_POINT_PARTS) expect(part).toMatch(/^[a-z][a-z0-9]*$/);
  });

  it('классы частей — по правилу классов скрипта (script_meta.classes)', () => {
    for (const name of Object.values(EXT_POINT_CLASSES).flat()) expect(name).toMatch(SCRIPT_CLASS);
  });
});
