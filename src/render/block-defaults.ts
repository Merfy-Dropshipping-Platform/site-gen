import { resolve } from 'node:path';

/**
 * Дефолтные пропсы блока из его puckConfig (`<Block>PuckConfig.defaults`).
 *
 * Нужны рендеру, чтобы отличить «мерчант ничего не вводил, это дефолт
 * конструктора» от «мерчант ввёл текст, который случайно совпал со служебным
 * словом». Раньше эту роль играл список строк в `empty-state.ts`, из-за чего
 * заголовок «Видео» или «Коллекция» молча вычищался и секция показывала
 * заглушку — мерчант видел, что его правка исчезла.
 *
 * Блоки лежат уже скомпилированными (`scripts/compile-astro-blocks.mjs`):
 *   dist/astro-blocks/<pkg>__<BlockName>__index.mjs
 * Тема может переопределять блок — тогда сначала пробуем её пакет.
 */
const THEME_PACKAGE_BY_ID: Record<string, string> = {
  rose: 'theme-rose',
  vanilla: 'theme-vanilla',
  bloom: 'theme-bloom',
  satin: 'theme-satin',
  flux: 'theme-flux',
};

const cache = new Map<string, Record<string, unknown>>();

function blocksDir(): string {
  return resolve(__dirname, '..', '..', 'astro-blocks');
}

async function loadDefaults(pkg: string, blockName: string): Promise<Record<string, unknown> | null> {
  try {
    const mod = (await import(resolve(blocksDir(), `${pkg}__${blockName}__index.mjs`))) as Record<
      string,
      unknown
    >;
    const cfg = (mod[`${blockName}PuckConfig`] ??
      Object.values(mod).find(
        (v) => v && typeof v === 'object' && 'fields' in (v as Record<string, unknown>),
      )) as { defaults?: Record<string, unknown> } | undefined;
    return cfg?.defaults ?? null;
  } catch {
    return null;
  }
}

/**
 * Дефолты блока для темы: сначала override пакета темы, затем theme-base.
 * Пустой объект, если блок не найден — вызывающий код должен работать и без них.
 */
export async function getBlockPuckDefaults(
  themeId: string | null | undefined,
  blockName: string,
): Promise<Record<string, unknown>> {
  const key = `${themeId ?? 'base'}::${blockName}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const themePackage = themeId ? THEME_PACKAGE_BY_ID[themeId] : undefined;
  const defaults =
    (themePackage ? await loadDefaults(themePackage, blockName) : null) ??
    (await loadDefaults('theme-base', blockName)) ??
    {};

  cache.set(key, defaults);
  return defaults;
}
