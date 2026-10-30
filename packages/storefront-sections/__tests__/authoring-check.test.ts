import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { authoringProblems } from '../src/authoring-check';
import { settingReads } from '../src/dead-settings';
import { libraryIndexOf, libraryIndexText, LIBRARY_INDEX_PATH } from '../src/generate/library-index';
import { libraryCopyProblems, libraryKeyOf } from '../src/library-copy';
import { isWarning } from '../src/problems';
import { prepareSection } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';
import { readFileSync } from 'node:fs';

// Предупреждения о составе секции (30.10): надписи и адреса картинок в разметке, параметры без чтения, копия
// библиотечной секции. Секция сохраняется — все четыре кода предупреждения.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

const field = (id: string, kind = 'string', extra: object = {}) => ({
  id,
  label: id,
  setting: { kind, default: '', ...extra },
});
const manifestOf = (settings: object[], extra: object = {}): string =>
  JSON.stringify({ sdk: 1, name: 'demo', kind: 'section', title: 'Демо', settings, ...extra }, null, 2);
const codes = async (files: Record<string, string>): Promise<string[]> =>
  (await authoringProblems(files)).map((item) => item.code);

describe('текст и адреса картинок в разметке', () => {
  const manifest = manifestOf([field('heading'), field('image', 'image', { maxBytes: 5_000_000 })]);

  it('надписи между тегами — одно предупреждение с примерами и числом, место первой', async () => {
    const files = {
      'section.json': manifest,
      'template.astro':
        '<section>\n  <h2>Наши товары</h2>\n  <p>Доставка по всей стране</p>\n  <span>{settings.heading}</span>\n  <img src={settings.image} alt="" />\n</section>',
    };
    const result = await authoringProblems(files);
    const text = result.filter((item) => item.code === 'taste-literal-text');
    expect(text).toHaveLength(1);
    expect(text[0]).toMatchObject({ file: 'template.astro', line: 2, column: 7 });
    expect(text[0]?.message).toContain('(2): «Наши товары», «Доставка по всей стране»');
    expect(result.every(isWarning)).toBe(true);
  });

  it('только выражения, сущности и знаки — без предупреждений', async () => {
    const files = {
      'section.json': manifest,
      'template.astro':
        '<section><h2>{settings.heading}</h2><p>&nbsp;→&times; 12</p><img src={settings.image} alt="" /></section>',
    };
    expect(await codes(files)).toEqual([]);
  });

  it('src="https://…", файл-картинка и фотобанк в коде — одно предупреждение taste-literal-image', async () => {
    const files = {
      'section.json': manifest,
      'template.astro':
        '---\nconst back = "https://images.unsplash.com/photo-1";\n---\n<section>\n  <img src="https://example.com/a.jpg" alt="" />\n  <img src={back} alt="" />\n  <h2>{settings.heading}</h2><p>{settings.image}</p>\n</section>',
    };
    const result = (await authoringProblems(files)).filter((item) => item.code === 'taste-literal-image');
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('(2): «https://images.unsplash.com/photo-1», «https://example.com/a.jpg»');
  });

  it('src с выражением и пустой src — без предупреждений', async () => {
    const files = {
      'section.json': manifest,
      'template.astro':
        '<section><img src={settings.image} alt="" /><img src="" alt="" /><h2>{settings.heading}</h2></section>',
    };
    expect(await codes(files)).toEqual([]);
  });
});

describe('параметры, которых никто не читает', () => {
  const settings = [field('heading'), field('subheading'), field('columns')];

  it('объявлены heading, subheading, columns, прочитан один — остальные в одном предупреждении с местом первого', async () => {
    const files = { 'section.json': manifestOf(settings), 'template.astro': '<h2>{settings.heading}</h2>' };
    const result = await authoringProblems(files);
    expect(result.map((item) => item.code)).toEqual(['taste-dead-setting']);
    expect(result[0]?.message).toContain('`subheading`, `columns`');
    expect(result[0]).toMatchObject({ file: 'section.json', line: 16, column: 13 });
  });

  it("settings['id'], шаблон и скрипт (ctx.settings), цель data.from — читают поле", async () => {
    const files = {
      'section.json': manifestOf(
        [field('heading'), field('sub-heading'), field('columns'), field('product', 'product')],
        {
          data: { item: { from: 'settings.product', fields: ['title'] } },
        },
      ),
      'template.astro': "<h2>{settings.heading}</h2><p>{settings['sub-heading']}</p>",
      'script.ts':
        "import { defineSection } from '@merfy/shell';\nexport default defineSection((ctx) => { ctx.settings['columns']; });\n",
    };
    expect(await codes(files)).toEqual([]);
  });

  it('settings передан целиком (spread, переменная, ключ вычисляется) — что читается, не видно: без предупреждения', async () => {
    const manifest = manifestOf(settings);
    expect(await codes({ 'section.json': manifest, 'template.astro': '<Box {...settings} />' })).toEqual([]);
    expect(
      await codes({ 'section.json': manifest, 'template.astro': '---\nconst s = settings;\n---\n<p>{s.heading}</p>' }),
    ).toEqual([]);
    expect(await codes({ 'section.json': manifest, 'template.astro': '<p>{settings[key]}</p>' })).toEqual([]);
    expect(
      await codes({
        'section.json': manifest,
        'template.astro': '---\nconst { settings: s } = Astro.props;\n---\n<p>{s.heading}</p>',
      }),
    ).toEqual([]);
  });

  it('per-page читает платформа, а не шаблон', async () => {
    const files = {
      'section.json': manifestOf([field('heading'), field('per-page')]),
      'template.astro': '<h2>{settings.heading}</h2>',
    };
    expect(await codes(files)).not.toContain('taste-dead-setting');
  });

  it('поле блока читается как block.settings.<id>', async () => {
    const blocks = { item: { title: 'Пункт', limit: 5, settings: [field('label'), field('hidden')] } };
    const files = {
      'section.json': manifestOf([field('heading')], { blocks }),
      'template.astro': '<h2>{settings.heading}</h2>{blocks.map((block) => <p>{block.settings.label}</p>)}',
    };
    const result = await authoringProblems(files);
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('`hidden`');
  });

  it('settingReads: названные ключи и признак «непрозрачно»', () => {
    expect(settingReads('{settings.a}{settings?.b}{settings["c-d"]}')).toEqual({
      ids: new Set(['a', 'b', 'c-d']),
      opaque: false,
    });
    expect(settingReads('const { settings, blocks } = Astro.props;').opaque).toBe(false);
    expect(settingReads('f(settings)').opaque).toBe(true);
  });
});

describe('копия библиотечной секции без изменений', () => {
  it('отпечатки в generated/library-index.json совпадают с папками библиотеки (забытый pnpm generate — красный тест)', async () => {
    const text = readFileSync(new URL(`../${LIBRARY_INDEX_PATH}`, import.meta.url), 'utf8');
    expect(text).toBe(libraryIndexText(await libraryIndexOf(PACKAGE_DIR)));
  });

  it('в индексе секции магазина и оболочки: hero и cart', async () => {
    const names = Object.values(await libraryIndexOf(PACKAGE_DIR));
    expect(names).toEqual(expect.arrayContaining(['hero', 'faq', 'cart', 'header']));
    expect(names.length).toBeGreaterThanOrEqual(36);
  });

  it('hero под другим именем и другим названием — предупреждение; под своим именем и изменённая — нет', async () => {
    const hero = await readSectionFolder(`${PACKAGE_DIR}fixtures/shop/hero`);
    const manifest = (hero['section.json'] ?? '').replace('"name": "hero"', '"name": "my-top"');
    const renamed: Record<string, string> = {
      ...hero,
      'section.json': manifest.replace(/"title": "[^"]*"/, '"title": "Мой верх"'),
    };
    const copy = await authoringProblems(renamed);
    expect(copy.map((item) => item.code)).toContain('taste-library-copy');
    expect(copy.find((item) => item.code === 'taste-library-copy')?.message).toContain('`hero`');
    expect(await codes(hero)).not.toContain('taste-library-copy');
    const changed = { ...renamed, 'template.astro': `${renamed['template.astro']}\n<!-- правка -->` };
    expect(await codes(changed)).not.toContain('taste-library-copy');
  });

  it('перевод строк и пробелы в конце строк отпечаток не меняют', async () => {
    const faq = await readSectionFolder(`${PACKAGE_DIR}fixtures/shop/faq`);
    const crlf = { ...faq, 'template.astro': (faq['template.astro'] ?? '').replaceAll('\n', '  \r\n') };
    expect(libraryKeyOf(crlf)).toBe(libraryKeyOf(faq));
  });

  it('индекс подставляется: свой индекс и не JSON — без падения', () => {
    expect(libraryCopyProblems({ 'section.json': '{' }, 'x', {})).toEqual([]);
    expect(libraryKeyOf({ 'template.astro': 'x' })).toBeNull();
  });
});

describe('библиотека проходит проверку без предупреждений о параметрах и копиях', () => {
  it.each(['fixtures/shop', '../storefront-shell/sections'])(
    '%s',
    async (root) => {
      const { readdirSync } = await import('node:fs');
      for (const name of readdirSync(`${PACKAGE_DIR}${root}`)) {
        const result = await prepareSection({
          prefix: 'shop',
          files: await readSectionFolder(`${PACKAGE_DIR}${root}/${name}`),
        });
        const items = result.ok ? result.section.warnings : result.problems;
        const own = items.filter((item) =>
          ['taste-dead-setting', 'taste-library-copy', 'taste-literal-image'].includes(item.code),
        );
        expect(own.map((item) => `${name}: ${item.code}`)).toEqual([]);
      }
    },
    120_000,
  );
});
