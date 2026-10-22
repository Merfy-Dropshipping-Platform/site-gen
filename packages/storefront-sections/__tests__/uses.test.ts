import { describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest, type SectionUse } from '../src/format';
import { templateProblems } from '../src/template';

// theme и shop в Astro.props (блок 1 «Секций и SDK», часть 4, Р1-4-5): только с "uses" в section.json.
const FRONTMATTER = 'во frontmatter только const { settings } = Astro.props;';
const usesText = (name: string): string => `${name} в Astro.props — только с "uses": ["${name}"] в section.json`;
const messages = async (text: string, uses: readonly SectionUse[] = []): Promise<string[]> =>
  (await templateProblems(text, undefined, uses)).map((item) => item.message);

describe('theme и shop в шаблоне', () => {
  it('с uses: theme и shop во frontmatter в любом порядке, выражения их читают', async () => {
    const text =
      "---\nconst { shop, settings, theme } = Astro.props;\n---\n<p>{shop.name} {theme['social-telegram']} {settings.heading}</p>";
    expect(await messages(text, ['theme', 'shop'])).toEqual([]);
    expect(await messages('---\nconst { shop } = Astro.props;\n---\n<p>{shop.name}</p>', ['shop'])).toEqual([]);
  });

  it('без uses: theme во frontmatter и в выражении — отказ с подсказкой про uses', async () => {
    expect(await messages('---\nconst { settings, theme } = Astro.props;\n---\n<p>{theme.x}</p>')).toEqual([
      usesText('theme'),
      usesText('theme'),
    ]);
    expect(await messages('---\nconst { settings, shop } = Astro.props;\n---\n<p>{theme.x}</p>', ['shop'])).toEqual([
      usesText('theme'),
    ]);
  });

  it('имя дважды или не из Astro.props секции — прежний отказ frontmatter', async () => {
    expect(await messages('---\nconst { settings, settings } = Astro.props;\n---\n<p></p>')).toEqual([FRONTMATTER]);
    expect(await messages('---\nconst { settings, cart } = Astro.props;\n---\n<p></p>', ['shop'])).toEqual([
      FRONTMATTER,
    ]);
  });

  it('templateOptionsOf передаёт uses: секция с uses проходит проверку шаблона целиком', async () => {
    const manifest = { sdk: 1, name: 'footer', kind: 'section', title: 'Подвал', settings: [], uses: ['shop'] };
    const read = readManifest({ 'section.json': JSON.stringify(manifest) });
    if (!read.ok) throw new Error(JSON.stringify(read.problems));
    const text = '---\nconst { settings, shop } = Astro.props;\n---\n<p>{shop.name}</p>';
    const checked = await checkTemplate(text, templateOptionsOf(read.value));
    expect(checked.problems).toEqual([]);
    expect(checked.render).not.toBeNull();
  }, 30_000);
});
