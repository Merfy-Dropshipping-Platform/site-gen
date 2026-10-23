import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tailwindCss, type Dictionary } from '@merfy/tokens';
import { compile } from 'tailwindcss';

// CSS секций страницы (блок 1 «Секций и SDK», 7 Г): классы Tailwind из готовой разметки секций — по словарю темы, без
// слоя base: сброс стилей уже есть на странице темы. Своего CSS у секции нет. Компилятор Tailwind — один на словарь.
const TAILWIND_DIR = dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'));
const TAILWIND_PREFIX = 'tailwindcss/';
const SOURCE = '@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);\n';
const CLASS_ATTRIBUTE = /\sclass="([^"]*)"/g;

type Compiler = Awaited<ReturnType<typeof compile>>;
// Компилятор — один на пару (словарь, строки @theme токенов секций страницы, Р4-10).
const compilers = new WeakMap<Dictionary, Map<string, Promise<Compiler>>>();

function loadStylesheet(id: string, base: string) {
  const file = id.startsWith(TAILWIND_PREFIX)
    ? join(TAILWIND_DIR, id.slice(TAILWIND_PREFIX.length))
    : resolve(base, id);
  return Promise.resolve({ content: readFileSync(file, 'utf8'), base: dirname(file), path: file });
}

function compilerOf(dictionary: Dictionary, sectionTheme: string): Promise<Compiler> {
  const byTheme = compilers.get(dictionary) ?? new Map<string, Promise<Compiler>>();
  compilers.set(dictionary, byTheme);
  const known = byTheme.get(sectionTheme);
  if (known !== undefined) return known;
  const created = compile(`${SOURCE}${tailwindCss(dictionary, { base: false })}\n${sectionTheme}`, {
    base: TAILWIND_DIR,
    loadStylesheet,
  });
  byTheme.set(sectionTheme, created);
  return created;
}

// Классы из атрибутов class="…" готовой разметки — без повторов, по алфавиту: одинаковая разметка — одинаковый CSS.
export const htmlClasses = (html: string): string[] =>
  [...new Set([...html.matchAll(CLASS_ATTRIBUTE)].flatMap((match) => (match[1] ?? '').split(/\s+/)))]
    .filter((name) => name !== '')
    .sort();

// sectionTheme — строки @theme токенов секций страницы (Р4-10): дописываются к источнику компилятора.
export async function sectionCss(html: string, dictionary: Dictionary, sectionTheme = ''): Promise<string> {
  const classes = htmlClasses(html);
  if (classes.length === 0) return '';
  return (await compilerOf(dictionary, sectionTheme)).build(classes);
}
