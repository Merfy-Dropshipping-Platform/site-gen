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

interface FontSpec {
  family: string;
  weights?: number[];
  italic?: boolean;
  source?: string;
}

/**
 * Build a single `<link>` tag that pulls every Google font the theme
 * declares. Theme-base blocks reference `var(--font-heading)` /
 * `var(--font-body)` which resolve to `'Bitter', serif` etc. — if the
 * browser can't find Bitter, it silently drops back to serif. Preview
 * iframe has no way to include fonts unless we inject them.
 *
 * Output:
 *   <link rel="preconnect" href="https://fonts.googleapis.com">
 *   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
 *   <link href="https://fonts.googleapis.com/css2?family=Bitter:...&family=Arsenal:..."
 *         rel="stylesheet">
 *
 * Returns an empty string when the theme has no Google fonts (or no
 * manifest at all), so callers can always interpolate the result.
 */
export function googleFontHead(themeId: string | null): string {
  if (!themeId) return '';
  const m = getThemeManifest(themeId);
  if (!m) return '';
  const fontsRaw = (m as unknown as { fonts?: FontSpec[] }).fonts ?? [];
  const googleFonts = fontsRaw.filter(
    (f) => !f.source || f.source === 'google',
  );
  if (googleFonts.length === 0) return '';

  const specs = googleFonts.map((f) => {
    const weights = (f.weights && f.weights.length > 0 ? f.weights : [400])
      .slice()
      .sort((a, b) => a - b);
    const family = encodeURIComponent(f.family).replace(/%20/g, '+');
    if (f.italic) {
      const ital = weights.map((w) => `0,${w}`).concat(weights.map((w) => `1,${w}`)).join(';');
      return `family=${family}:ital,wght@${ital}`;
    }
    return `family=${family}:wght@${weights.join(';')}`;
  });
  const url =
    'https://fonts.googleapis.com/css2?' + specs.join('&') + '&display=swap';
  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link href="${url}" rel="stylesheet">`,
  ].join('\n  ');
}
