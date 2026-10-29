import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tasteProblems } from '../src/taste-check';

// HTML-текст — только через класс rich-text (tokens, generate/tailwind.ts): в библиотеке секций магазина и в секциях
// оболочки каждый set:html с richtext-полем, HTML записи или политики стоит на элементе с этим классом, а остальные
// поля с HTML — только <em> и <strong> (string и text с ai) — класса не требуют.
const ROOTS = [join(__dirname, '../fixtures/shop'), join(__dirname, '../../storefront-shell/sections')];

const sectionsOf = (root: string): { name: string; files: Record<string, string> }[] =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(root, entry.name);
      const files = Object.fromEntries(
        readdirSync(dir)
          .filter((file) => file === 'section.json' || file === 'template.astro')
          .map((file) => [file, readFileSync(join(dir, file), 'utf8')]),
      );
      return { name: entry.name, files };
    })
    .filter((section) => section.files['template.astro'] !== undefined);

const SECTIONS = ROOTS.flatMap(sectionsOf);

describe('HTML-текст секций библиотеки', () => {
  it('секции найдены', () => {
    expect(SECTIONS.length).toBeGreaterThan(30);
  });

  it.each(SECTIONS.map((section) => [section.name, section.files] as const))(
    '%s: каждый HTML-текст в обёртке rich-text',
    async (_name, files) => {
      const warnings = (await tasteProblems(files)).filter((item) => item.code === 'taste-rich-text');
      expect(warnings.map((item) => `${item.line}:${item.column} ${item.message}`)).toEqual([]);
    },
  );
});
