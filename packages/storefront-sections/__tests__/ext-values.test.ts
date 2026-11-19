import { sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate } from '../src/compile';
import { extDeclarationsOf } from '../src/ext-values';
import { readManifest } from '../src/format';
import { prepareSection } from '../src/prepare';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// ext секции (prerender, 20.11): объявление «поле ext-record → стор расширения» в section.json, свойство шаблона ext и его
// путь через процесс рендера. Расширение — picks, секция — «Подборка».
const PICK = {
  id: 'pick',
  label: 'Подборка',
  setting: { kind: 'ext-record', ext: 'picks', record: 'pick', default: null },
};
const NAMES = { pick: { kinds: ['ext-record'], label: 'Подборка', about: 'Подборка расширения', asks: ['подборка'] } };
const manifestOf = (extra: object = {}) => ({
  sdk: 1,
  name: 'pick',
  kind: 'section',
  title: 'Подборка',
  settings: [PICK],
  names: NAMES,
  ...extra,
});
const read = (manifest: unknown) => readManifest({ 'section.json': JSON.stringify(manifest) });
const problemsOf = (manifest: unknown): string[] => {
  const result = read(manifest);
  return result.ok ? [] : result.problems.map((item) => `${item.code} ${item.message}`);
};
const DECLARED = { card: { from: 'settings.pick', store: 'pickCard' } };

describe('ext в section.json: форма', () => {
  it('имя → { from, store }; без ext манифест прежний', () => {
    const result = read(manifestOf({ ext: DECLARED }));
    expect(result.ok ? result.value.ext : null).toEqual(DECLARED);
    const plain = read(manifestOf());
    expect(plain.ok && 'ext' in plain.value).toBe(false);
  });

  it.each<[string, object, string]>([
    ['from не settings.<id>', { card: { from: 'page.record', store: 'pickCard' } }, 'ext.card.from'],
    ['store не имя стора', { card: { from: 'settings.pick', store: 'pick-card' } }, 'ext.card.store'],
    ['нет store', { card: { from: 'settings.pick' } }, 'ext.card.store'],
    ['лишний ключ', { card: { from: 'settings.pick', store: 'pickCard', fn: 'x' } }, 'ext.card'],
    ['имя с заглавной', { Card: { from: 'settings.pick', store: 'pickCard' } }, 'ext.Card'],
  ])('%s — manifest-invalid', (_title, ext, path) => {
    const problems = problemsOf(manifestOf({ ext }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`manifest-invalid ${path}`);
  });

  it('больше четырёх имён — ошибка', () => {
    const ext = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((name) => [name, DECLARED.card]));
    expect(problemsOf(manifestOf({ ext })).join('\n')).toContain('не больше 4 имён');
  });
});

describe('ext в section.json: смысл', () => {
  const files = (ext: unknown, settings: unknown[] = [PICK]) => ({
    'section.json': JSON.stringify(manifestOf({ ext, settings })),
    'template.astro':
      '---\nconst { settings, ext } = Astro.props;\n---\n<p>{ext.card === null ? "пусто" : ext.card.title}</p>',
  });

  it('from — параметр вида ext-record: расширение и вид записи берутся из него', () => {
    const result = read(manifestOf({ ext: DECLARED }));
    if (!result.ok) throw new Error('манифест не прочитан');
    expect(extDeclarationsOf(result.value)).toEqual([
      { name: 'card', field: 'pick', store: 'pickCard', ext: 'picks', record: 'pick' },
    ]);
  });

  it('from указывает на параметр другого вида или на несуществующий — manifest-invalid с местом в section.json', async () => {
    const stringField = { id: 'pick', label: 'Подборка', setting: { kind: 'string', default: '' } };
    for (const settings of [[stringField], []]) {
      const result = await prepareSection({ prefix: 'picks', files: files(DECLARED, settings) });
      expect(result.ok).toBe(false);
      const problem = result.ok ? null : result.problems.find((item) => item.message.startsWith('ext.card.from'));
      expect(problem).toMatchObject({ code: 'manifest-invalid', file: 'section.json' });
      expect(problem?.line).toBeGreaterThan(0);
    }
  });

  it('шаблон читает ext из Astro.props — секция принимается', async () => {
    const result = await prepareSection({ prefix: 'picks', files: files(DECLARED) });
    expect(result.ok ? [] : result.problems.map((item) => item.message)).toEqual([]);
  });
});

const CARD = `---
const { settings, ext } = Astro.props;
---
<p>{ext.card === null ? 'пусто' : ext.card.title}</p>`;
const OPTIONS = { richtext: { section: new Set<string>(), block: new Set<string>() }, blocks: false };

const opened: SectionRenderer[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

describe('ext в процессе рендера', () => {
  async function request() {
    const checked = await checkTemplate(CARD, OPTIONS);
    if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
    return {
      section: 'picks:pick',
      hash: sha256(Buffer.from(checked.render, 'utf8')),
      module: checked.render,
      settings: { pick: 'rec-1' },
    };
  }

  it('значение стора — в ext.card; null — шаблон видит null', async () => {
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const base = await request();
    expect(await renderer.render({ ...base, ext: { card: { title: 'Тёплые вещи' } } })).toContain('<p>Тёплые вещи</p>');
    expect(await renderer.render({ ...base, ext: { card: null } })).toContain('<p>пусто</p>');
  }, 30_000);
});
