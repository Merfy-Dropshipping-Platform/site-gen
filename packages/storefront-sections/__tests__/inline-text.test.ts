import { sha256 } from '@merfy/storefront-build';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSectionBlocks } from '../src/blocks';
import { settingFieldsOf } from '../src/fields';
import { readManifest } from '../src/format';
import { cleanInlineText, cleanInstanceInlineText, isInlineTextSpec } from '../src/inline-text';
import { prepareSection } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { richtextIdsOf } from '../src/set-html';
import { resolveSectionSettings } from '../src/settings';
import { templateProblems } from '../src/template';

// Текст с начертаниями (базовые секции, этап 0, E14): значение string и text с ai — только <em> и <strong> без
// атрибутов; очищается при записи ревизии (sites) и при сведении значений (settings.ts), шаблон выводит его set:html.

// Вредные значения и что от них остаётся.
const HARMFUL: readonly [string, string][] = [
  ['<script>alert(1)</script>Привет', 'Привет'],
  ['<img src=x onerror=alert(1)>Привет', 'Привет'],
  ['<em class="x" onclick="alert(1)" style="color:red">курсив</em>', '<em>курсив</em>'],
  ['<strong onmouseover="alert(1)">жирный</strong>', '<strong>жирный</strong>'],
  ['<a href="javascript:alert(1)">ссылка</a>', 'ссылка'],
  ['javascript:alert(1)', 'javascript:alert(1)'],
  ['<strong><em>вложенный</strong> хвост', '<strong><em>вложенный</em></strong> хвост'],
  ['</strong>битый<em', 'битый'],
  ['<svg><script>alert(1)</script></svg><iframe src="https://x"></iframe>', ''],
  ['<style>h2{}</style><b>b</b><i>i</i><u>u</u>', 'biu'],
  ['&lt;script&gt;alert(1)&lt;/script&gt;', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['Цена < 100 & скидка > 5', 'Цена &lt; 100 &amp; скидка &gt; 5'],
  ['<!-- <script>alert(1)</script> -->текст', 'текст'],
];

describe('cleanInlineText', () => {
  it('остаются только <em> и <strong> без атрибутов; теги, обработчики, комментарии и javascript: — нет', () => {
    for (const [value, clean] of HARMFUL) expect(cleanInlineText(value), value).toBe(clean);
  });

  it('повторная очистка ничего не меняет; простой текст и <strong><em> конструктора — как есть', () => {
    for (const [value] of HARMFUL) expect(cleanInlineText(cleanInlineText(value))).toBe(cleanInlineText(value));
    expect(cleanInlineText('Добро пожаловать')).toBe('Добро пожаловать');
    expect(cleanInlineText('<strong><em>Скидки</em></strong> до 50%')).toBe('<strong><em>Скидки</em></strong> до 50%');
  });

  it('вид с начертаниями — string и text с ai; без ai, richtext и другие виды — нет', () => {
    expect(isInlineTextSpec({ kind: 'string', ai: 'title' })).toBe(true);
    expect(isInlineTextSpec({ kind: 'text', ai: 'description' })).toBe(true);
    expect(isInlineTextSpec({ kind: 'string' })).toBe(false);
    expect(isInlineTextSpec({ kind: 'richtext' })).toBe(false);
    expect(isInlineTextSpec({ kind: 'url', ai: 'title' })).toBe(false);
  });
});

const HEADING = {
  id: 'heading',
  label: 'Заголовок',
  setting: { kind: 'string' as const, default: '', ai: 'title' as const },
};
const TEXT = {
  id: 'text',
  label: 'Текст',
  setting: { kind: 'text' as const, default: '', ai: 'description' as const },
};
const PLAIN = { id: 'label', label: 'Подпись', setting: { kind: 'string' as const, default: '' } };
const MANIFEST = {
  settings: [HEADING, PLAIN],
  blocks: { slide: { title: 'Слайд', limit: 5, settings: [TEXT, PLAIN] } },
};
const BAD = '<em onclick="alert(1)">a</em><script>alert(1)</script>';

describe('очистка при выводе: сведение значений', () => {
  it('у полей с ai — очищено и в секции, и в блоке; поле без ai — как есть (его шаблон экранирует)', () => {
    expect(resolveSectionSettings(MANIFEST.settings, { heading: BAD, label: BAD }).values).toEqual({
      heading: '<em>a</em>',
      label: BAD,
    });
    const blocks = resolveSectionBlocks(MANIFEST, [{ id: 's-1', type: 'slide', settings: { text: BAD } }]).blocks;
    expect(blocks[0]?.settings).toEqual({ text: '<em>a</em>', label: '' });
  });
});

describe('очистка при записи: экземпляр ревизии', () => {
  it('settings секции и блоков по полям их типов; другие поля, неизвестный тип и чужие ключи — как есть', () => {
    const instance = {
      id: 'hero-1',
      section: 'shop:hero',
      settings: { heading: BAD, label: BAD },
      blocks: [
        { id: 's-1', type: 'slide', settings: { text: BAD, label: BAD } },
        { id: 'x-1', type: 'other', settings: { text: BAD } },
      ],
      wrapper: { padding: { top: 8, bottom: 8 } },
    };
    expect(cleanInstanceInlineText(MANIFEST, instance)).toEqual({
      ...instance,
      settings: { heading: '<em>a</em>', label: BAD },
      blocks: [
        { id: 's-1', type: 'slide', settings: { text: '<em>a</em>', label: BAD } },
        { id: 'x-1', type: 'other', settings: { text: BAD } },
      ],
    });
  });

  it('не той формы — как есть', () => {
    expect(cleanInstanceInlineText(null, { settings: { heading: BAD } })).toEqual({ settings: { heading: BAD } });
    expect(cleanInstanceInlineText(MANIFEST, 'hero')).toBe('hero');
    expect(cleanInstanceInlineText(MANIFEST, { settings: 'x', blocks: [1] })).toEqual({ settings: 'x', blocks: [1] });
  });
});

describe('set:html поля с начертаниями', () => {
  const FRONT = '---\nconst { settings, blocks } = Astro.props;\n---\n';

  it('можно: string и text с ai у секции и у блока; string без ai — отказ', async () => {
    const read = readManifest({
      'section.json': JSON.stringify({ sdk: 1, name: 'promo', kind: 'section', title: 'Промо', ...MANIFEST }),
    });
    if (!read.ok) throw new Error(JSON.stringify(read.problems));
    const ids = richtextIdsOf(read.value);
    expect([...ids.section]).toEqual(['heading']);
    expect([...ids.block]).toEqual(['text']);
    const messages = async (body: string): Promise<string[]> =>
      (await templateProblems(`${FRONT}${body}`, ids)).map((item) => item.message);
    expect(await messages('<h2 set:html={settings.heading} />')).toEqual([]);
    expect(await messages('<div>{blocks.map((block) => <p set:html={block.settings.text} />)}</div>')).toEqual([]);
    expect(await messages('<p set:html={settings.label} />')).toHaveLength(1);
  });
});

const HERO = fileURLToPath(new URL('../fixtures/shop/hero', import.meta.url));
const opened: SectionRenderer[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

describe('«Первый экран»: заголовок и текст с начертаниями', () => {
  it('жирный и курсив выводятся тегами, вредное — не выводится', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await readSectionFolder(HERO) });
    if (!result.ok || result.section.render === null) throw new Error(JSON.stringify(result));
    const { manifest, render } = result.section;
    const { blocks } = resolveSectionBlocks(manifest, [
      { id: 'h-1', type: 'heading', settings: { heading: '<strong>Жирный</strong> <img src=x onerror=alert(1)>' } },
      { id: 't-1', type: 'text', settings: { text: '<em onclick="alert(1)">Курсив</em><script>alert(2)</script>' } },
    ]);
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const html = await renderer.render({
      section: 'shop:hero',
      hash: sha256(Buffer.from(render, 'utf8')),
      module: render,
      settings: resolveSectionSettings(settingFieldsOf(manifest.settings), {}).values,
      blocks,
    });
    expect(html).toContain('<strong>Жирный</strong>');
    expect(html).toContain('<em>Курсив</em>');
    expect(html).not.toMatch(/<script|onerror|onclick|<img/);
    expect(html).not.toContain('&lt;strong&gt;');
  }, 60_000);
});
