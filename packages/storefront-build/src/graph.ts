import type { StorefrontManifest } from './manifest';

// Граф «страница ← данные» (design.md блока 4, раздел 1): по нему событие dependent-pages блока 3 пересобирает только
// нужные страницы, а дорисовка (Св-1 В) знает, что перерисовать после правки.

// Какие сущности поменялись между двумя картами «сущность → хэш»: добавлены, убраны или правлены. По порядку ключей.
export function changedEntities(before: Record<string, string>, after: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => before[key] !== after[key]).sort();
}

// Адреса страниц, которые зависят от поменявшихся сущностей.
export function dependentPages(manifest: Pick<StorefrontManifest, 'pages'>, changed: readonly string[]): string[] {
  const touched = new Set(changed);
  return manifest.pages.filter((page) => page.deps.some((dep) => touched.has(dep))).map((page) => page.path);
}
