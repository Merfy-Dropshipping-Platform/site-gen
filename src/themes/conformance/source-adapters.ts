/**
 * Central source-adapter registry (Task 2).
 *
 * A stable import/map layer only: it imports the two theme-owned source adapters
 * and exposes the generic resolver the snapshot loader uses. It carries no
 * theme-owned literal data (paths / digest-input arrays / audit refs live in the
 * per-theme `*-source-adapter.ts` modules). This partition is the provenance
 * boundary between shared input (this file) and per-theme digest input (each
 * adapter). A theme name can only select a registered adapter, never an
 * arbitrary filesystem root.
 */

import type {
  SupportedConformanceTheme,
} from './theme-adapter';
import type {
  ThemeSourceAdapter,
  ThemeSourceAdapterMap,
} from './source-types';
import { BLOOM_SOURCE_ADAPTER } from './bloom-source-adapter';
import { SATIN_SOURCE_ADAPTER } from './satin-source-adapter';

export const THEME_SOURCE_ADAPTERS = {
  bloom: BLOOM_SOURCE_ADAPTER,
  satin: SATIN_SOURCE_ADAPTER,
} satisfies ThemeSourceAdapterMap;

/** The set of themes with a registered source adapter. */
const REGISTERED = new Set<SupportedConformanceTheme>(
  Object.keys(THEME_SOURCE_ADAPTERS) as SupportedConformanceTheme[],
);

function isRegistered(theme: string): theme is SupportedConformanceTheme {
  return REGISTERED.has(theme as SupportedConformanceTheme);
}

/**
 * Resolve a theme's source adapter. Non-registered / path-like names throw; a
 * theme name never resolves an arbitrary filesystem root.
 */
export function getThemeSourceAdapter<T extends SupportedConformanceTheme>(
  theme: T,
): ThemeSourceAdapter<T>;
export function getThemeSourceAdapter(
  theme: string,
): ThemeSourceAdapter<SupportedConformanceTheme>;
export function getThemeSourceAdapter(
  theme: string,
): ThemeSourceAdapter<SupportedConformanceTheme> {
  if (!isRegistered(theme)) {
    throw new Error(`unsupported theme source adapter "${theme}"`);
  }
  return THEME_SOURCE_ADAPTERS[theme] as ThemeSourceAdapter<SupportedConformanceTheme>;
}
