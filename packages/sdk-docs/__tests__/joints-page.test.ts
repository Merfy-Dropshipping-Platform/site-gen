import { RECORD_FIELDS, sampleRecord } from '@merfy/storefront-build';
import { ACTION_NAMES, ACTIONS, isActionName, requiredParams } from '@merfy/shell/actions';
import { beforeAll, describe, expect, it } from 'vitest';
import { docsFiles, type DocsFiles } from '../src/docs';
import { THEME_ROLES } from '../src/pages/joints';
import { readSources, type DocsSources } from '../src/sources';

// joints.md «Стыки с витриной» (28.11): короткая страница для слабой модели рядом со шпаргалкой. Таблицы строятся из
// данных ядра и сборки, поэтому тест держит то, что руками не напишешь: размер, подстановки, сверку с источниками.
const JOINTS_MAX_BYTES = 9 * 1024;
let sources: DocsSources;
let files: DocsFiles;
let page: string;
beforeAll(async () => {
  sources = await readSources();
  files = docsFiles(sources);
  page = files['joints.md'] ?? '';
});

const section = (title: string): string => page.split(`## ${title}`)[1]?.split('\n## ')[0] ?? '';

describe('joints.md', () => {
  it(`не больше ${JOINTS_MAX_BYTES} байт, без неподставленных меток`, () => {
    expect(Buffer.byteLength(page)).toBeGreaterThan(3_000);
    expect(Buffer.byteLength(page)).toBeLessThanOrEqual(JOINTS_MAX_BYTES);
    expect(page).not.toContain('<!--');
  });

  it('в оглавлении llms.txt; в шпаргалке — строка в «Данные» и ссылка в «Дальше»', () => {
    expect(files['llms.txt']).toContain('- [Стыки с витриной](joints.md):');
    const quick = files['quick.md'] ?? '';
    expect(quick.split('## Данные')[1]?.split('\n## ')[0]).toContain(
      '[joints.md](joints.md): читай его вместе со шпаргалкой',
    );
    expect(quick.split('## Дальше')[1]).toContain('[joints.md](joints.md)');
  });

  it('данные: у каждого вида записи все публичные поля из RECORD_FIELDS', () => {
    const rows = section('Данные').split('\n');
    for (const [kind, fields] of Object.entries(RECORD_FIELDS)) {
      const row = rows.find((line) => line.includes(fields.map((field) => `\`${field}\``).join(', '))) ?? '';
      expect(row, kind).not.toBe('');
    }
  });

  it('ловушки данных верны: цена, карточка коллекции, обложка коллекции', () => {
    const product = sampleRecord('product');
    const collection = sampleRecord('collection');
    expect(Object.keys(product.price)).toEqual(['amount', 'currency', 'text']);
    const card = Object.keys(collection.products[0] ?? {});
    expect(card).toEqual(expect.arrayContaining(['image', 'images', 'variantId']));
    expect(card).not.toContain('variants');
    expect(RECORD_FIELDS.collection).toContain('images');
    expect(RECORD_FIELDS.product).toContain('variants');
    const traps = section('Данные');
    for (const word of ['price.text', 'price.amount', 'price.value', '`variantId`', '`collection.images[0]`'])
      expect(traps, word).toContain(word);
  });

  it('кнопки: у каждого действия с параметрами — обязательные из ActionSpec.required, остальные — «можно»', () => {
    const rows = section('Кнопки').split('\n');
    const withParams = ACTION_NAMES.filter(isActionName).filter((name) => {
      const markup = ACTIONS[name].markup;
      return markup !== null && Object.keys(markup).length > 0;
    });
    expect(withParams.length).toBeGreaterThanOrEqual(10);
    for (const name of withParams) {
      const row = rows.find((line) => line.startsWith(`| \`${name}\` |`)) ?? '';
      const [, , required = '', optional = ''] = row.split('|').map((cell) => cell.trim());
      const markup = ACTIONS[name].markup ?? {};
      const asCells = (params: string[]): string =>
        params.length === 0 ? '—' : params.map((p) => `\`data-${p}\``).join(', ');
      const need = [...requiredParams(name)];
      expect(required, name).toBe(asCells(need));
      expect(optional, name).toBe(asCells(Object.keys(markup).filter((param) => !need.includes(param))));
    }
    expect(section('Кнопки')).toContain('Кнопка без обязательного параметра не сработает.');
  });

  it('actions.md показывает обязательные параметры явно', () => {
    const row = (files['actions.md'] ?? '').split('\n').find((line) => line.startsWith('| `cart.add` |')) ?? '';
    expect(row).toContain('обязательно: `data-product-id`; можно: `data-variant-id`, `data-quantity`');
    expect(files['actions.md']).toContain('Кнопка без обязательного параметра не сработает');
  });

  it('пустые поля: правило главной и других страниц — слово в слово из data.md; нет данных — блок не рисуется', () => {
    const rule = 'первый товар, все товары (первые 24), записи всех блогов (первые 12); у политики — `null`';
    const oneLine = (text: string): string => text.replaceAll(/\s+/g, ' ');
    expect(oneLine(files['data.md'] ?? '')).toContain(rule);
    expect(oneLine(section('Пустые поля'))).toContain(rule);
    expect(section('Пустые поля')).toContain('блок не рисуется');
  });

  it('тема: каждый класс — токен из словаря (TOKENS.md) или раскладка без вида темы', () => {
    const layout = new Set(['m-0', 'inline-flex', 'items-center', 'justify-center', 'h-11', 'px-6', 'px-2', 'py-1']);
    layout.add('mx-auto').add('px-4');
    const classes = THEME_ROLES.flatMap(([, groups]) => groups.flatMap((group) => group.split(/\s+/)));
    const names = classes.map((name) => name.replace(/^(?:md|hover):/, ''));
    const unknown = names.filter((name) => !layout.has(name) && !sources.tokens.includes(`\`${name}\``));
    expect(unknown).toEqual([]);
    expect(names).toEqual(
      expect.arrayContaining(['text-heading', 'bg-primary', 'text-primary-foreground', 'rounded-button']),
    );
    for (const [role] of THEME_ROLES) expect(section('Тема'), role).toContain(role);
  });

  it('пример: текст в странице — файлы папки examples/joints-product, обращений к владельцу магазина нет', () => {
    const files_ = sources.examples['joints-product'] ?? {};
    expect(Object.keys(files_).sort()).toEqual(['section.json', 'template.astro']);
    for (const text of Object.values(files_)) expect(page).toContain(text);
    expect(files_['template.astro']).toContain('data-product-id={settings.product.id}');
    expect(files_['template.astro']).toContain('data-variant-id=');
    expect(files_['template.astro']).toContain('settings.product.available === false');
    expect(files_['template.astro']).not.toMatch(/выберите|в настройках/i);
  });
});
