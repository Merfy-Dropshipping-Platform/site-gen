import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BEHAVIORS, type BehaviorName } from '../src/core/behaviors/catalog';

// Разметка наших секций «Шапка» и «Подвал» против каталога поведений (блок 7, часть 7б, Р7б-15): имена поведений,
// части и параметры — из каталога. До проверки при сохранении (часть 6б) это единственная проверка.
const sourceOf = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../storefront-sections/fixtures/shop/${name}/template.astro`, import.meta.url)),
    'utf8',
  );
const TEMPLATES = [['header'], ['footer']].map(([name]) => [name, sourceOf(name ?? '')] as const);

const isBehavior = (name: string): name is BehaviorName => Object.hasOwn(BEHAVIORS, name);
const behaviorsOf = (source: string): string[] =>
  [...source.matchAll(/data-behavior="([a-z-]+)"/g)].map((item) => item[1] ?? '');
const rootsOf = (source: string): { name: string; tag: string }[] =>
  [...source.matchAll(/<[a-z][\w-]*\s[^>]*data-behavior="([a-z-]+)"[^>]*>/g)].map((item) => ({
    name: item[1] ?? '',
    tag: item[0],
  }));

describe('разметка «Шапки» и «Подвала» и каталог поведений', () => {
  it.each(TEMPLATES)(
    '%s: data-behavior — имя из каталога; sticky-header в шаблоне нет (его ставит обёртка)',
    (_name, source) => {
      for (const name of behaviorsOf(source)) {
        expect(isBehavior(name)).toBe(true);
        expect(name).not.toBe('sticky-header');
      }
    },
  );

  it.each(TEMPLATES)('%s: data-part — часть одного из поведений шаблона', (_name, source) => {
    const allowed = new Set(
      behaviorsOf(source)
        .filter(isBehavior)
        .flatMap((name) => BEHAVIORS[name].parts),
    );
    for (const item of source.matchAll(/data-part="([a-z-]+)"/g)) expect(allowed.has(item[1] ?? '')).toBe(true);
  });

  const checkParams = (tag: string, name: BehaviorName): void => {
    const params = Object.keys(BEHAVIORS[name].params);
    const found = [...tag.matchAll(/\sdata-([a-z-]+)=/g)].map((item) => item[1] ?? '');
    for (const attribute of found) {
      if (attribute === 'behavior') continue;
      expect(params).toContain(attribute);
    }
  };

  it.each(TEMPLATES)('%s: параметры на корне поведения — из каталога', (_name, source) => {
    for (const { name, tag } of rootsOf(source)) {
      if (!isBehavior(name)) continue;
      checkParams(tag, name);
    }
  });
});
