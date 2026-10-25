import { parse } from '@astrojs/compiler-rs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MANIFEST_FILE, propsUsesOf, readManifest, type SectionManifest } from '../src/format';
import { prepareSection, type PrepareResult } from '../src/prepare';
import type { Checked, SectionProblem } from '../src/problems';
import { readSectionFolder } from '../src/read-folder';
import { scriptMetaOf, scriptMetaSchema } from '../src/script-meta';
import { nameProblems } from '../src/script-names';
import { NO_MARKUP, templateMarkup } from '../src/template-markup';

// "ext:<id>" в uses секции (блок 9 «Секций и SDK», часть 9в; Р9в-19…Р9в-22): скрипту нужен ctx.ext.<id>. В шаблон и
// входы сборки не идёт, в script_meta — вместе с частью ext. Правило id — то же, что extUseSchema в
// @merfy/storefront-config (те же строки проверяет его extensions.test.ts). Расширение — test-ext «Отзывы-тест».
const FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));
const USES_TEXT =
  'нужно theme, shop, cart, favorites, auth, newsletter, variants, search, catalog или ext:<id расширения>';
const FORM_TEXT =
  'метод расширения — ext.<id>.<метод>, id — из "ext:<id>" в uses, метод — из storefront.methods манифеста';
const UNDECLARED_TEXT =
  'действие ext.test-ext.vote: расширения test-ext нет в uses — добавьте "ext:test-ext" в section.json';
const read = (fields: Record<string, unknown>) =>
  readManifest({
    [MANIFEST_FILE]: JSON.stringify({ sdk: 1, name: 'reviews', kind: 'section', title: 'Отзывы', ...fields }),
  });
const messages = (result: Checked<unknown>): string[] =>
  result.ok ? [] : result.problems.map((item: SectionProblem) => `${item.code} ${item.message}`);
const codes = (result: Checked<unknown>): string[] => messages(result).map((line) => line.split(' ')[0] ?? '');
const manifestOf = (uses: NonNullable<SectionManifest['uses']>): SectionManifest => ({
  sdk: 1,
  name: 'reviews',
  kind: 'section',
  title: 'Отзывы',
  settings: [],
  uses,
});
const markupOf = async (text: string) => templateMarkup((await Promise.resolve(parse(text))).ast, text);
const lines = (found: readonly SectionProblem[]): string[] =>
  found.map((item) => `${item.code} ${item.file}:${item.line}:${item.column} ${item.message}`);
const prepared = async (folder: string): Promise<PrepareResult> =>
  prepareSection({ prefix: 'shop', files: await readSectionFolder(`${FIXTURES}/${folder}`) });

describe('uses: ext:<id>', () => {
  it.each([[['ext:test-ext']], [['ext:loyalty']], [['theme', 'cart', 'ext:test-ext', 'ext:loyalty']]])(
    '%j — годится',
    (uses) => {
      expect(messages(read({ uses }))).toEqual([]);
    },
  );

  it.each(['test-ext', 'ext:Test', 'ext:ab', 'ext:', `ext:${'a'.repeat(33)}`])(
    '%s — manifest-invalid с подсказкой',
    (use) => {
      expect(messages(read({ uses: [use] }))).toEqual([`manifest-invalid uses.0: ${USES_TEXT}`]);
    },
  );

  it('повтор — manifest-invalid; 12 значений можно, 13 — нет', () => {
    const ext = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter) => `ext:ext-${letter}`);
    const twelve = ['theme', 'shop', 'cart', 'favorites', 'auth', 'newsletter', ...ext];
    expect(codes(read({ uses: ['ext:test-ext', 'ext:test-ext'] }))).toEqual(['manifest-invalid']);
    expect(messages(read({ uses: twelve }))).toEqual([]);
    expect(codes(read({ uses: [...twelve, 'ext:ext-g'] }))).toEqual(['manifest-invalid']);
  });

  it('в шаблон — только theme и shop; глобальному скрипту ext:<id> можно', () => {
    const manifest = read({ uses: ['ext:test-ext', 'shop'] });
    expect(manifest.ok && propsUsesOf(manifest.value)).toEqual(['shop']);
    expect(messages(read({ kind: 'global', uses: ['ext:test-ext', 'cart'] }))).toEqual([]);
  });
});

describe('script_meta с ext:<id>', () => {
  it('uses — модули SDK и ext:<id> по алфавиту, parts — с частью ext', () => {
    const meta = scriptMetaOf(manifestOf(['ext:test-ext', 'theme', 'cart', 'ext:loyalty']), NO_MARKUP, null);
    expect(meta).toEqual({ uses: ['cart', 'ext:loyalty', 'ext:test-ext'], parts: ['cart', 'ext'], classes: [] });
    expect(scriptMetaOf(manifestOf(['cart']), NO_MARKUP, null)).toEqual({
      uses: ['cart'],
      parts: ['cart'],
      classes: [],
    });
  });

  it('схема script_meta: ext:<id> в uses и ext в parts годятся, остальное — нет', () => {
    expect(scriptMetaSchema.safeParse({ uses: ['ext:test-ext'], parts: ['ext'], classes: [] }).success).toBe(true);
    expect(scriptMetaSchema.safeParse({ uses: ['ext:Test'], parts: [], classes: [] }).success).toBe(false);
    expect(scriptMetaSchema.safeParse({ uses: [], parts: ['ext:test-ext'], classes: [] }).success).toBe(false);
  });
});

describe('метод расширения в разметке', () => {
  const TEMPLATE = `<div>
  <button type="button" data-action="ext.test-ext.vote">Полезно</button>
  <button type="button" data-action="click:ext.test-ext.report">Пожаловаться</button>
  <button type="button" data-action="ext.test-ext">Без метода</button>
  <button type="button" data-action="ext.Test.vote ext.test-ext.vote-up">Опечатки</button>
</div>`;

  it('ext:<id> в uses — ext.<id>.<метод> проходит, и с событием; не той формы — action-unknown с местом', async () => {
    const markup = await markupOf(TEMPLATE);
    const found = nameProblems({ manifest: manifestOf(['ext:test-ext']), markup, facts: null, scriptEntry: null });
    expect(lines(found)).toEqual([
      `action-unknown template.astro:4:38 data-action «ext.test-ext»: ${FORM_TEXT}`,
      `action-unknown template.astro:5:38 data-action «ext.Test.vote»: ${FORM_TEXT}`,
      `action-unknown template.astro:5:52 data-action «ext.test-ext.vote-up»: ${FORM_TEXT}`,
    ]);
  });

  it('ext:<id> нет в uses — action-unknown с подсказкой, и у секции без скрипта', async () => {
    const markup = await markupOf('<button type="button" data-action="ext.test-ext.vote">Полезно</button>');
    const found = nameProblems({ manifest: manifestOf(['ext:loyalty']), markup, facts: null, scriptEntry: null });
    expect(found.map((item) => item.message)).toEqual([UNDECLARED_TEXT]);
  });
});

describe('фикстуры с ext:<id> при сохранении', () => {
  it('ext-reviews принята, script_meta — ext:test-ext и часть ext', async () => {
    const result = await prepared('scripts/ext-reviews');
    expect(result.ok ? [] : lines(result.problems)).toEqual([]);
    expect(result.ok && result.section.scriptMeta).toEqual({ uses: ['ext:test-ext'], parts: ['ext'], classes: [] });
  });

  it('ext-undeclared — action-unknown с местом и подсказкой', async () => {
    const result = await prepared('broken/ext-undeclared');
    expect(result.ok ? [] : lines(result.problems)).toEqual([`action-unknown template.astro:2:38 ${UNDECLARED_TEXT}`]);
  });
});
