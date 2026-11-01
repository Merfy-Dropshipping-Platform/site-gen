import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readManifest, type SectionFiles, type SectionManifest } from '../src/format';
import { isListSection, listSectionProblems } from '../src/list-section';
import { PROBLEM_INFO, problemDoc } from '../src/problem-info';
import { prepareSection } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';

// Список товаров страницы каталога и коллекции (шаг 5, 01.11): секция без фильтров, сортировки или листания —
// отказ list-incomplete. Наши «Каталог» и «Коллекция» проходят; блог, «Коллекция товаров» и своя секция без списка — не
// списки страницы.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));

const manifestOf = (files: SectionFiles): SectionManifest => {
  const read = readManifest(files);
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  return read.value;
};
const shop = async (name: string): Promise<SectionFiles> => readSectionFolder(`${SHOP}/${name}`);
const withName = (files: SectionFiles, name: string): SectionFiles => ({
  ...files,
  'section.json': JSON.stringify({ ...JSON.parse(files['section.json'] ?? '{}'), name }),
});
const codesOf = (files: SectionFiles): string[] =>
  listSectionProblems(manifestOf(files), files['template.astro']).map((item) => item.code);

// Простая секция-витрина товаров из поля коллекции: без per-page, без page.list.
const SHOWCASE_TEMPLATE =
  '<ul>{settings.collection && settings.collection.products.map((card) => <li><a href={card.url}>{card.title}</a></li>)}</ul>';
const showcase = (name: string, settings: object[] = []): SectionFiles => ({
  'section.json': JSON.stringify({
    sdk: 1,
    name,
    kind: 'section',
    title: 'Витрина',
    settings: [{ id: 'collection', label: 'Выбор коллекции', setting: { kind: 'collection' } }, ...settings],
  }),
  'template.astro': SHOWCASE_TEMPLATE,
});
const PER_PAGE = {
  id: 'per-page',
  label: 'Карточки',
  setting: { kind: 'range', default: 12, min: 2, max: 24, step: 1 },
};

describe('наши секции', () => {
  it.each(['catalog', 'collection'])(
    '«%s» — список страницы с фильтрами, сортировкой и листанием: отказа нет',
    async (name) => {
      const files = await shop(name);
      expect(isListSection(manifestOf(files), files['template.astro'] ?? '')).toBe(true);
      expect(codesOf(files)).toEqual([]);
    },
  );

  it.each(['blog', 'collection-products', 'collections', 'product'])(
    '«%s» — не список товаров страницы',
    async (name) => {
      const files = await shop(name);
      expect(isListSection(manifestOf(files), files['template.astro'] ?? '')).toBe(false);
      expect(codesOf(files)).toEqual([]);
    },
  );
});

describe('отказ list-incomplete', () => {
  it('«Каталог» без листания: нет per-page и ссылок дальше — отказ называет листание', async () => {
    const files = await shop('catalog');
    const read = manifestOf(files);
    const manifest = {
      ...read,
      settings: read.settings.filter((entry) => !('id' in entry && entry.id === 'per-page')),
    };
    const template = (files['template.astro'] ?? '')
      .replace(/\{page\.list\.next && \([\s\S]*?\)\}\n/, '')
      .replace(/\{page\.list\.pages > 1 && \([\s\S]*?<\/nav>\n\s*\)\}\n/, '')
      .replace(/page\.list\.prev/g, 'null');
    const broken = { ...files, 'section.json': JSON.stringify(manifest), 'template.astro': template };
    const [found, ...rest] = listSectionProblems(manifestOf(broken), broken['template.astro']);
    expect(rest).toEqual([]);
    expect(found?.code).toBe('list-incomplete');
    expect(found?.file).toBe('template.astro');
    expect(found?.message).toContain('листание: поле `per-page`');
    expect(found?.message).toContain('`page.list.next`');
    expect(found?.message).not.toContain('фильтры:');
    expect(found?.message).not.toContain('сортировка:');
    expect(found?.message).toContain('data.md#список-страницы');
  });

  it('«Коллекция», переписанная на товары поля коллекции, — отказ называет листание, фильтры и сортировку', () => {
    const files = showcase('collection');
    const message = listSectionProblems(manifestOf(files), files['template.astro'])[0]?.message ?? '';
    expect(message).toContain('секция `collection` — список товаров страницы');
    expect(message).toContain('листание:');
    expect(message).toContain('фильтры:');
    expect(message).toContain('сортировка:');
  });

  it('своя секция для каталога (`exhibit-catalog`) — тоже список страницы', () => {
    expect(codesOf(showcase('exhibit-catalog'))).toEqual(['list-incomplete']);
    expect(codesOf(showcase('rings-collection'))).toEqual(['list-incomplete']);
  });

  it('«Карточки» и поле коллекции под любым именем — список страницы', () => {
    expect(codesOf(showcase('sale-hall', [PER_PAGE]))).toEqual(['list-incomplete']);
  });

  it('витрина товаров под другим именем без «Карточек» — не список: отказа нет', () => {
    expect(codesOf(showcase('featured-products'))).toEqual([]);
    expect(codesOf(showcase('collection-showcase'))).toEqual([]);
  });

  it('сортировка без фильтров — список страницы, отказ называет фильтры и листание', () => {
    const files = {
      ...showcase('sale-hall'),
      'template.astro':
        '<div>{page.list && page.list.sorts.map((sort) => <label><input type="radio" name="sort" value={sort.value} />{sort.label}</label>)}</div>',
    };
    const message = listSectionProblems(manifestOf(files), files['template.astro'])[0]?.message ?? '';
    expect(message).toContain('фильтры:');
    expect(message).toContain('листание:');
    expect(message).not.toContain('сортировка:');
  });

  it('шаблон ждёт блок `filters`, а в section.json его нет — отказ в section.json', async () => {
    const files = await shop('collection');
    // undefined JSON.stringify не пишет: в section.json нет ни blocks, ни defaultBlocks.
    const manifest = { ...manifestOf(files), blocks: undefined, defaultBlocks: undefined };
    const broken = { ...files, 'section.json': JSON.stringify(manifest) };
    const [found] = listSectionProblems(manifestOf(broken), files['template.astro']);
    expect(found?.file).toBe('section.json');
    expect(found?.message).toContain('типы блоков `filters` и `sort` в section.json');
  });

  it('комментарий с page.list не засчитывается', () => {
    const files = {
      ...showcase('exhibit-catalog'),
      'template.astro': `<!-- page.list.items page.list.facets page.list.sorts page.list.next data-part="list" data-behavior="catalog" -->${SHOWCASE_TEMPLATE}`,
    };
    expect(codesOf(files)).toEqual(['list-incomplete']);
  });

  it('справка кода — на разделе «Список страницы» data.md', () => {
    expect(PROBLEM_INFO['list-incomplete'].when).toContain('список товаров');
    expect(problemDoc('list-incomplete')).toBe('data.md#список-страницы');
  });
});

describe('приём секции', () => {
  it('«Коллекция» под именем `collection` проходит приём', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await shop('collection') });
    expect(result.ok ? [] : result.problems).toEqual([]);
  }, 60_000);

  it('витрина под именем `exhibit-catalog` — отказ list-incomplete при приёме', async () => {
    const result = await prepareSection({ prefix: 'shop', files: withName(showcase('x'), 'exhibit-catalog') });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toContain('list-incomplete');
  }, 60_000);
});
