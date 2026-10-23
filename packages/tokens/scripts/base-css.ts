import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import type { Dictionary } from '../src/types';
import { GENERATED_NOTE, tailwindCss } from '../src/generate/tailwind';

// Порядок слоёв страницы: база (preflight и база словаря) ниже утилит, классы обёртки перекрывают базу (факт 19).
export const LAYER_ORDER = '@layer theme, base, components, utilities;';

const TAILWIND_DIR = dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'));
const TAILWIND_PREFIX = 'tailwindcss/';
// Блочная обёртка секции — в слое base (блок 4 «Секций и SDK», Р4-13): классы обёртки её перекрывают.
const SECTION_BLOCK = '@layer base { merfy-section { display: block; } }';

function loadStylesheet(id: string, base: string) {
  const file = id.startsWith(TAILWIND_PREFIX)
    ? join(TAILWIND_DIR, id.slice(TAILWIND_PREFIX.length))
    : resolve(base, id);
  return Promise.resolve({ content: readFileSync(file, 'utf8'), base: dirname(file), path: file });
}

async function compiledBase(dictionary: Dictionary): Promise<string> {
  const source = `@import "tailwindcss/preflight.css" layer(base);\n${tailwindCss(dictionary)}\n${SECTION_BLOCK}`;
  const compiler = await compile(source, { base: TAILWIND_DIR, loadStylesheet });
  return compiler.build([]);
}

// База страницы (design.md блока 4 «Секций и SDK», 4.2): Tailwind 4.3.2 компилирует
// `@import "tailwindcss/preflight.css" layer(base);`, tailwindCss(dictionary) и
// `@layer base { merfy-section { display: block; } }`; build([]) — без утилит. Первая строка — /* GENERATED_NOTE */,
// вторая — LAYER_ORDER, дальше — вывод Tailwind как есть.
export async function baseCss(dictionary: Dictionary): Promise<string> {
  return `/* ${GENERATED_NOTE} */\n${LAYER_ORDER}\n${await compiledBase(dictionary)}\n`;
}
