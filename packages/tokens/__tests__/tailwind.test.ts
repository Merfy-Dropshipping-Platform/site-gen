import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import themeWithExtension from '../fixtures/theme-with-extension/theme.json';
import { platformDictionary } from '../src/dictionary';
import { tailwindCss } from '../src/generate/tailwind';
import { parseTheme } from '../src/values';

// Настоящий Tailwind 4.3.2: классы словаря собираются, закрытые — нет, служебные остались (design.md, разделы 11 и 15).

const TAILWIND_DIR = dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'));

const loadStylesheet = (id: string, base: string) => {
  const file = id === 'tailwindcss' ? join(TAILWIND_DIR, 'index.css') : resolve(base, id);
  return Promise.resolve({ content: readFileSync(file, 'utf8'), base: dirname(file), path: file });
};

const escapeClass = (cls: string): string => cls.replace(/[:/.()[\]#%]/g, (char) => `\\${char}`);

async function buildClasses(css: string, classes: string[]): Promise<string> {
  const compiler = await compile(`@import "tailwindcss";\n${css}`, { base: TAILWIND_DIR, loadStylesheet });
  return compiler.build(classes);
}

const builds = async (css: string, cls: string): Promise<boolean> =>
  (await buildClasses(css, [cls])).includes(`.${escapeClass(cls)}`);

const OWN = [
  'bg-background',
  'text-foreground',
  'bg-card',
  'bg-primary',
  'text-primary-foreground',
  'hover:bg-primary-hover',
  'hover:text-primary-hover-foreground',
  'border-primary-border',
  'bg-secondary',
  'border-secondary-border',
  'bg-muted',
  'text-muted-foreground',
  'border-border',
  'border-input',
  'ring-ring',
  'text-heading',
  'text-price',
  'text-price-old',
  'bg-sale',
  'bg-badge',
  'bg-primary/50',
  'font-heading',
  'font-body',
  'weight-heading',
  'text-xs',
  'text-2xl',
  'text-5xl',
  'tracking-heading',
  'rounded-button',
  'rounded-input',
  'rounded-card',
  'rounded-media',
  'rounded-popover',
  'rounded-badge',
  'border-width-button',
  'border-width-card',
  'border-width-popover',
  'shadow-card',
  'shadow-popover',
  'shadow-drawer',
  'py-section',
  'gap-section-gap',
  'p-card',
  'gap-x-grid-column',
  'gap-y-grid-row',
  'max-w-page',
  'w-logo',
  'card-style-card:bg-card',
  'card-style-card:p-card',
  'card-align-center:text-center',
  'motion-reveal-on:opacity-100',
  'motion-hover-lift:hover:-translate-y-1',
];
const CLOSED = [
  'text-red-600',
  'bg-white',
  'bg-black',
  'text-6xl',
  'font-sans',
  'font-mono',
  'rounded-lg',
  'rounded-md',
  'shadow-lg',
  'shadow-sm',
];
const SERVICE = [
  'bg-transparent',
  'text-current',
  'bg-inherit',
  'rounded-full',
  'rounded-none',
  'font-bold',
  'font-semibold',
  'p-4',
  'gap-2',
  'max-w-md',
  'w-full',
  'leading-tight',
  'tracking-wide',
  'border',
  'opacity-50',
];
const EXTENSION_OWN = [
  'bg-theme-gold',
  'text-theme-gold-foreground',
  'rounded-theme-pill',
  'shadow-theme-glow',
  'theme-ribbon-on:bg-theme-gold',
];

describe('Tailwind по словарю платформы', () => {
  const css = tailwindCss(platformDictionary);

  it('файл — 101 строка', () => {
    expect(css.trimEnd().split('\n')).toHaveLength(101);
  });

  it.each(OWN)('класс словаря собирается: %s', async (cls) => {
    expect(await builds(css, cls)).toBe(true);
  });

  it.each(CLOSED)('встроенный класс закрыт: %s', async (cls) => {
    expect(await builds(css, cls)).toBe(false);
  });

  it.each(SERVICE)('служебный класс остался: %s', async (cls) => {
    expect(await builds(css, cls)).toBe(true);
  });

  it('переменные словаря Tailwind в :root не печатает — значения даёт только tokensCss', async () => {
    const output = await buildClasses(css, ['bg-primary', 'rounded-button', 'shadow-card']);
    expect(output).not.toMatch(/--(primary|radius-button|shadow-card):/);
  });
});

describe('Tailwind по словарю темы с расширением', () => {
  const css = tailwindCss(parseTheme(themeWithExtension.tokens).dictionary);

  it.each(EXTENSION_OWN)('свой класс темы собирается: %s', async (cls) => {
    expect(await builds(css, cls)).toBe(true);
  });

  it.each(['shadow-lg', 'bg-white'])('встроенный класс закрыт и здесь: %s', async (cls) => {
    expect(await builds(css, cls)).toBe(false);
  });
});
