/**
 * Singleton PageResolver factory per theme.
 *
 * Backend code (sites.service, preview.controller, build.service) calls
 * `getPageResolver(themeId)` to obtain a cached resolver for a given theme.
 * The resolver wraps the inline-imported `theme.json` manifest plus a shared
 * `LazySeed` instance that loads `pages/<id>.json` files from disk on demand.
 *
 * `themePackageRoots` points at `backend/services/sites/packages/theme-<id>`
 * which is where the build pipeline reads default page content from when a
 * revision lacks pre-baked `pagesData`.
 */

import * as path from 'path';
import { PageResolver, LazySeed } from '../../packages/theme-contract/page-resolver';
import type { ThemeManifest } from '../../packages/theme-contract/page-resolver';
import { getThemeManifest } from './theme-manifest-loader';

// Пакеты тем лежат рядом с рабочим каталогом сервиса (`<service>/packages`,
// в образе — `/app/packages`), а НЕ внутри dist: `__dirname/../..` указывал на
// `dist/packages`, которого не существует ни локально, ни в контейнере, поэтому
// ленивый сид страниц молча падал с ENOENT. Проявлялось как «страница есть в
// теме, но не открывается на старом сайте»: у сайта её нет в ревизии, а взять
// из темы не получалось. Остальные модули (main.ts, sites.service,
// assemble-from-packages) используют тот же process.cwd()-путь.
const packagesRoot = path.resolve(process.cwd(), 'packages');
const themePackageRoots: Record<string, string> = {
  rose: path.join(packagesRoot, 'theme-rose'),
  vanilla: path.join(packagesRoot, 'theme-vanilla'),
  bloom: path.join(packagesRoot, 'theme-bloom'),
  satin: path.join(packagesRoot, 'theme-satin'),
  flux: path.join(packagesRoot, 'theme-flux'),
};

const lazySeed = new LazySeed({ themePackageRoots });
const cache = new Map<string, PageResolver>();

export function getPageResolver(themeId: string): PageResolver {
  const cached = cache.get(themeId);
  if (cached) return cached;

  const manifest = getThemeManifest(themeId);
  if (!manifest) throw new Error(`Unknown theme: ${themeId}`);

  const resolver = new PageResolver({
    manifest: manifest as unknown as ThemeManifest,
    lazySeed,
  });
  cache.set(themeId, resolver);
  return resolver;
}
