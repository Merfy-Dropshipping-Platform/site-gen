/**
 * Shared loader for `packages/theme-<id>/theme.json` manifests.
 *
 * These files are imported via `resolveJsonModule: true`, so nest-cli inlines
 * their contents at TypeScript compile time. The rose/vanilla/bloom/satin/flux
 * manifests travel with the dist bundle — no runtime filesystem lookup.
 *
 * Every controller that needs theme defaults or colour schemes should call
 * `getThemeManifest(themeId)` here instead of re-importing from packages/.
 * This keeps the 5 theme JSONs in one place so adding / removing a theme is a
 * one-line change.
 */

import roseManifestRaw from '../../packages/theme-rose/theme.json';
import vanillaManifestRaw from '../../packages/theme-vanilla/theme.json';
import bloomManifestRaw from '../../packages/theme-bloom/theme.json';
import satinManifestRaw from '../../packages/theme-satin/theme.json';
import fluxManifestRaw from '../../packages/theme-flux/theme.json';

export interface ThemeManifest {
  id: string;
  name: string;
  version?: string;
  extends?: string;
  category?: string;
  description?: string;
  tokens?: string;
  defaults?: Record<string, string>;
  colorSchemes?: Array<{
    id: string;
    name: string;
    tokens: Record<string, string>;
  }>;
  blocks?: Record<string, { override: { path: string; reason: string } }>;
  customBlocks?: Record<string, { path: string; category?: string; requiredFeatures?: string[] }>;
  features?: Record<string, boolean>;
}

const MANIFESTS: Record<string, ThemeManifest> = {
  rose: roseManifestRaw as unknown as ThemeManifest,
  vanilla: vanillaManifestRaw as unknown as ThemeManifest,
  bloom: bloomManifestRaw as unknown as ThemeManifest,
  satin: satinManifestRaw as unknown as ThemeManifest,
  flux: fluxManifestRaw as unknown as ThemeManifest,
};

export function getThemeManifest(themeId: string): ThemeManifest | null {
  return MANIFESTS[themeId] ?? null;
}

export function listThemeIds(): string[] {
  return Object.keys(MANIFESTS);
}
