import { sha256 } from '@merfy/storefront-build';
import type { Queryable, SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it, vi } from 'vitest';
import { readVisibleSections, type CodeDeps } from '../src/code';
import { sectionExtensionOf } from '../src/section-extension';

// Название расширения у секций списка /sections (блок 12 «Секций и SDK», часть 12б, Р12б-10). Расширение — test-ext.
const ENABLED = [{ id: 'test-ext', title: 'Отзывы-тест' }, { id: 'no-title' }];

describe('sectionExtensionOf', () => {
  it.each<[string, unknown]>([
    ['test-ext:reviews', { id: 'test-ext', title: 'Отзывы-тест' }],
    ['shop:hero', undefined],
    ['no-title:block', undefined],
    ['other-ext:block', undefined],
    ['reviews', undefined],
    [':reviews', undefined],
  ])('%s → %j', (name, expected) => {
    expect(sectionExtensionOf(name, ENABLED)).toEqual(expected);
  });

  it('пустое название — поля нет', () => {
    expect(sectionExtensionOf('test-ext:reviews', [{ id: 'test-ext', title: '' }])).toBeUndefined();
  });
});

const rowOf = (name: string, owner: string): SectionRow => ({
  id: `row-${owner}`,
  name,
  kind: 'global',
  author: 'extension',
  owner,
  release: '0.1.0',
  sourceHash: 'a'.repeat(64),
  contentHash: 'b'.repeat(64),
  manifest: { sdk: 1, name: 'mark', kind: 'global', title: 'Отметка', settings: [] },
  template: '',
  style: '',
  render: null,
  renderHash: null,
  script: null,
  scriptHash: null,
  warnings: [],
  draft: false,
  published: false,
  createdAt: '2026-10-24T00:00:00.000Z',
});

describe('readVisibleSections — расширение секции', () => {
  it('секция включённого расширения с названием — extension { id, title }; без названия — ключа нет; в rows — только id и версия', async () => {
    const rows = vi.fn(() => Promise.resolve([rowOf('test-ext:mark', 'test-ext'), rowOf('no-title:mark', 'no-title')]));
    const db: Queryable = { query: vi.fn() };
    const answer = {
      success: true,
      data: [
        { id: 'test-ext', version: '0.1.0', name: 'Отзывы-тест', hooks: [] },
        { id: 'no-title', version: '1.0.0' },
      ],
    };
    const deps: CodeDeps = {
      db,
      shell: { version: '0.1.0', hash: sha256('ядро'), parts: [], code: '' },
      call: () => Promise.resolve(answer),
      timeoutMs: 1_000,
      log: () => undefined,
      rows,
    };

    const sections = await readVisibleSections(deps, 'shop-1');

    expect(sections?.get('test-ext:mark')?.extension).toEqual({ id: 'test-ext', title: 'Отзывы-тест' });
    expect(sections?.get('no-title:mark')).toBeDefined();
    expect(sections?.get('no-title:mark')).not.toHaveProperty('extension');
    expect(rows).toHaveBeenCalledWith(db, {
      shopId: 'shop-1',
      extensions: [
        { id: 'test-ext', version: '0.1.0' },
        { id: 'no-title', version: '1.0.0' },
      ],
    });
  });
});
