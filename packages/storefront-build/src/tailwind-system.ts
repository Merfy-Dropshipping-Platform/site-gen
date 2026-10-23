import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tailwindCss, type Dictionary } from '@merfy/tokens';
import { __unstable__loadDesignSystem } from 'tailwindcss';

// Один Tailwind для проверки классов и сборки (блок 4 «Секций и SDK», Р4-3): что проверка пропустила, то сборка
// и отрендерит. API помечен unstable — версию не поднимаем без зелёного теста на списки классов (факты 14–17).

export interface ClassSystem {
  // CSS каждого класса или null — Tailwind со словарём такого класса не знает (candidatesToCss).
  cssOf(classes: readonly string[]): (string | null)[];
  // Имена классов, которые знает Tailwind со словарём (getClassList) — для близких имён в подсказке.
  classNames(): readonly string[];
}

const TAILWIND_DIR = dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'));
const TAILWIND_PREFIX = 'tailwindcss/';
const SOURCE = '@import "tailwindcss/theme.css";\n@import "tailwindcss/utilities.css";\n';

function loadStylesheet(id: string, base: string) {
  const file = id.startsWith(TAILWIND_PREFIX)
    ? join(TAILWIND_DIR, id.slice(TAILWIND_PREFIX.length))
    : resolve(base, id);
  return Promise.resolve({ content: readFileSync(file, 'utf8'), base: dirname(file), path: file });
}

// Один объект на пару (словарь, sectionTheme): кэш — WeakMap по словарю, внутри Map по строке.
const systems = new WeakMap<Dictionary, Map<string, Promise<ClassSystem>>>();

async function createSystem(dictionary: Dictionary, sectionTheme: string): Promise<ClassSystem> {
  const source = `${SOURCE}${tailwindCss(dictionary, { base: false })}\n${sectionTheme}`;
  const design = await __unstable__loadDesignSystem(source, { base: TAILWIND_DIR, loadStylesheet });
  return {
    cssOf: (classes) => design.candidatesToCss([...classes]),
    classNames: () => design.getClassList().map((entry) => entry[0]),
  };
}

export async function classSystem(dictionary: Dictionary, sectionTheme: string): Promise<ClassSystem> {
  const byTheme = systems.get(dictionary) ?? new Map<string, Promise<ClassSystem>>();
  systems.set(dictionary, byTheme);
  const known = byTheme.get(sectionTheme);
  if (known !== undefined) return known;
  const created = createSystem(dictionary, sectionTheme);
  byTheme.set(sectionTheme, created);
  return created;
}
