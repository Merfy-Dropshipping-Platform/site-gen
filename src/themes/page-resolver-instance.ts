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

const themePackageRoots: Record<string, string> = {
  rose: path.join(__dirname, '..', '..', 'packages', 'theme-rose'),
  vanilla: path.join(__dirname, '..', '..', 'packages', 'theme-vanilla'),
  bloom: path.join(__dirname, '..', '..', 'packages', 'theme-bloom'),
  satin: path.join(__dirname, '..', '..', 'packages', 'theme-satin'),
  flux: path.join(__dirname, '..', '..', 'packages', 'theme-flux'),
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
