import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import { platformDictionary } from '../src/dictionary';
import { LAYER_ORDER, baseCss } from '../scripts/base-css';
import { GENERATED_NOTE, tailwindCss } from '../src/generate/tailwind';

// База страницы и три сброса теней (блок 4 «Секций и SDK», design.md 4.2 и 4.6).
const PACKAGE_DIR = resolve(import.meta.dirname, '..');
const TAILWIND_DIR = dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'));

function loadStylesheet(id: string, base: string) {
  const file = id.startsWith('tailwindcss/') ? join(TAILWIND_DIR, id.slice('tailwindcss/'.length)) : resolve(base, id);
  return Promise.resolve({ content: readFileSync(file, 'utf8'), base: dirname(file), path: file });
}

async function utilitiesCss(classes: string[]): Promise<string> {
  const source = `@import "tailwindcss/utilities.css" layer(utilities);\n${tailwindCss(platformDictionary, { base: false })}`;
  return (await compile(source, { base: TAILWIND_DIR, loadStylesheet })).build(classes);
}

describe('словарь: три сброса теней', () => {
  it('в @theme — сбросы drop-shadow, text-shadow и inset-shadow', () => {
    const css = tailwindCss(platformDictionary);
    for (const reset of ['--drop-shadow-*: initial;', '--text-shadow-*: initial;', '--inset-shadow-*: initial;']) {
      expect(css).toContain(reset);
    }
  });

  it('настоящий Tailwind: drop-shadow-lg, text-shadow-sm, inset-shadow-sm — без CSS; shadow-card — с CSS', async () => {
    const css = await utilitiesCss(['drop-shadow-lg', 'text-shadow-sm', 'inset-shadow-sm', 'shadow-card']);
    expect(css).not.toContain('.drop-shadow-lg');
    expect(css).not.toContain('.text-shadow-sm');
    expect(css).not.toContain('.inset-shadow-sm');
    expect(css).toContain('.shadow-card');
  });
});

describe('база страницы generated/base.css', () => {
  it('заметка, порядок слоёв, preflight, база словаря и merfy-section — в слое base', async () => {
    const css = await baseCss(platformDictionary);
    const lines = css.split('\n');
    expect(lines[0]).toBe(`/* ${GENERATED_NOTE} */`);
    expect(lines[1]).toBe(LAYER_ORDER);
    expect(css).toContain('box-sizing: border-box');
    expect(css).toMatch(
      /\[hidden\]:where\(:not\(\[hidden=['"]until-found['"]\]\)\)\s*\{\s*display:\s*none\s*!important/,
    );
    expect(css).toContain('font-family: var(--font-body)');
    // Запрет прокрутки окнами не сдвигает страницу: место под полосу прокрутки занято всегда.
    expect(css).toMatch(/html\s*\{\s*scrollbar-gutter:\s*stable/);
    expect(css).toMatch(/merfy-section\s*\{\s*display:\s*block;?\s*\}/);
    expect(css.indexOf('@layer base')).toBeGreaterThan(-1);
    expect(css.indexOf('@layer base')).toBeLessThan(css.search(/merfy-section\s*\{/));
    expect(css).not.toMatch(/@layer utilities\s*\{\s*\./);
    expect(Buffer.byteLength(css)).toBeLessThan(8000);
  });

  it('файл generated/base.css совпадает с генератором', async () => {
    expect(readFileSync(join(PACKAGE_DIR, 'generated/base.css'), 'utf8')).toBe(await baseCss(platformDictionary));
  });

  it('вход @merfy/tokens/base.css и файл в публикации', () => {
    const manifest: unknown = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));
    expect(manifest).toMatchObject({ exports: { './base.css': './generated/base.css' } });
    // Уточнение 23.10: expect.arrayContaining внутри объекта линтер пакета считает any (no-unsafe-assignment),
    // поэтому список files читаем сами.
    const files: unknown =
      typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'files') : undefined;
    expect(Array.isArray(files) && files.includes('generated/base.css')).toBe(true);
  });
});
