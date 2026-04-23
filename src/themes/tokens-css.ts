/**
 * Canonical tokens.css generator — SHARED by preview endpoint and live build.
 *
 * Inputs:
 *   - `themeSettings` (typically `revision.data.themeSettings`) — merchant's
 *     customizations from the constructor's theme panel.
 *   - `themeId` — site's theme id; theme manifest (`packages/theme-<id>/theme.json`)
 *     provides defaults.
 *
 * Output: CSS string to inject as `<style>` or write as `src/styles/tokens.css`.
 *
 * Parity guarantee: if preview iframe and live build both call this function
 * with the same themeSettings + themeId, they emit identical CSS.
 *
 * This file is the single source of truth. Previous implementations (in
 * `preview.controller.ts` as `buildTokensCss` and in
 * `assemble-from-packages.ts` as `generateTokensCssV2`-based emission)
 * converge here.
 */
import { getThemeManifest } from './theme-manifest-loader';

export function buildTokensCss(
  settings: unknown,
  themeId: string | null,
): string {
  const manifest = themeId ? getThemeManifest(themeId) : null;
  const s = isPlainObject(settings) ? settings : {};
  const buttonRadius = toPx(s.buttonRadius, 0);
  const cardRadius = toPx(s.cardRadius, 8);
  const inputRadius = toPx(s.inputRadius, 8);
  const mediaRadius = toPx(s.mediaRadius, 8);
  const fieldRadius = toPx(s.fieldRadius, 4);
  const headingFont = fontFamily(s.headingFont, 'system-ui');
  const bodyFont = fontFamily(s.bodyFont, 'system-ui');
  const sectionPadding =
    typeof s.sectionPadding === 'number' ? `${s.sectionPadding}px` : '80px';
  const bodyWeight = typeof s.bodyWeight === 'number' ? s.bodyWeight : 400;
  const headingWeight =
    typeof s.headingWeight === 'number' ? s.headingWeight : 400;
  const logoWidth = toPx(s.logoWidth, 40);
  const errorColor = hexToRgbTriple(s.errorColor) ?? '252 165 165';

  // Theme manifest is the SOURCE OF TRUTH for fonts/radii/spacing/sizes.
  // Theme defaults (Bitter/Arsenal for Rose, Urbanist/Inter for Bloom,
  // Kelly Slab/Arsenal for Satin, Roboto Flex for Flux, Bitter/Arsenal
  // for Vanilla) always win over merchant-generic values from
  // themeSettings — merchant's ThemeSettings UI doesn't yet expose these
  // fields per-site so letting their defaults override theme identity
  // makes every theme visually indistinguishable. Merchant retains
  // control over colorSchemes (which ARE exposed) and per-block props.
  const themeDefaults = (manifest?.defaults ?? {}) as Record<string, string>;
  const themeFirst = (themeKey: string, hardcoded: string): string =>
    themeDefaults[themeKey] ?? hardcoded;

  const rootRules = `
:root {
  --radius-button: ${themeFirst('--radius-button', buttonRadius)};
  --radius-card: ${themeFirst('--radius-card', cardRadius)};
  --radius-input: ${themeFirst('--radius-input', inputRadius)};
  --radius-media: ${themeFirst('--radius-media', mediaRadius)};
  --radius-field: ${themeFirst('--radius-field', fieldRadius)};
  --font-heading: ${themeFirst('--font-heading', headingFont)};
  --font-body: ${themeFirst('--font-body', bodyFont)};
  --weight-body: ${themeDefaults['--weight-body'] ?? bodyWeight};
  --weight-heading: ${themeDefaults['--weight-heading'] ?? headingWeight};
  --section-padding: ${themeFirst('--spacing-section-y', sectionPadding)};
  --spacing-section-y: ${themeFirst('--spacing-section-y', sectionPadding)};
  --spacing-grid-col-gap: ${themeDefaults['--spacing-grid-col-gap'] ?? '24px'};
  --spacing-grid-row-gap: ${themeDefaults['--spacing-grid-row-gap'] ?? '32px'};
  --size-hero-heading: ${themeDefaults['--size-hero-heading'] ?? '48px'};
  --size-hero-button-h: ${themeDefaults['--size-hero-button-h'] ?? '48px'};
  --size-nav-link: ${themeDefaults['--size-nav-link'] ?? '14px'};
  --size-section-heading: ${themeDefaults['--size-section-heading'] ?? '20px'};
  --size-logo-width: ${themeFirst('--size-logo-width', logoWidth)};
  --size-newsletter-form-w: ${themeDefaults['--size-newsletter-form-w'] ?? '420px'};
  --container-max-width: ${themeDefaults['--container-max-width'] ?? '1320px'};
  --color-error: ${errorColor};
  --color-muted: 156 163 175;
  --color-primary: 17 17 17;
}`;

  // Merchant colorSchemes win — they're editable via the admin ThemeSettings
  // UI, so flipping precedence would retroactively change the look of every
  // existing site. Theme manifest schemes fill the gap only for ids the
  // merchant hasn't defined (rare: themes ship 3-4 schemes, merchants seed 5).
  const merchantSchemes = Array.isArray(s.colorSchemes) ? s.colorSchemes : [];
  const merchantById = new Map<string, Record<string, unknown>>();
  for (const raw of merchantSchemes) {
    if (isPlainObject(raw) && typeof (raw as Record<string, unknown>).id === 'string') {
      merchantById.set(
        schemeClassId(String((raw as Record<string, unknown>).id)),
        raw as Record<string, unknown>,
      );
    }
  }
  const themeSchemes = manifest?.colorSchemes ?? [];

  const schemeRuleLines: string[] = [];
  for (const themeScheme of themeSchemes) {
    const key = schemeClassId(themeScheme.id);
    const merchant = merchantById.get(key);
    // Merchant override wins when present — matches the "what you see in
    // constructor is what lands on live" contract. Fall back to theme
    // manifest tokens only when merchant didn't touch this scheme id.
    if (merchant) {
      const rule = buildSchemeRule(merchant);
      if (rule) {
        schemeRuleLines.push(rule);
      } else {
        schemeRuleLines.push(buildThemeSchemeRule(themeScheme));
      }
    } else {
      schemeRuleLines.push(buildThemeSchemeRule(themeScheme));
    }
    merchantById.delete(key);
  }
  for (const remaining of merchantById.values()) {
    const rule = buildSchemeRule(remaining);
    if (rule) schemeRuleLines.push(rule);
  }
  const schemeRules = schemeRuleLines.filter((r) => r.length > 0).join('\n');

  // :root получает активную цветовую схему. Merchant-scheme'ы идут первыми —
  // `themeSettings.defaultSchemeIndex` ссылается на merchant порядок. Fallback
  // на theme-manifest only when merchant didn't seed any scheme.
  const schemes: Record<string, unknown>[] = [
    ...(merchantSchemes.filter(isPlainObject) as Record<string, unknown>[]),
    ...themeSchemes.map((ts) => themeSchemeToMerchantShape(ts)),
  ];
  const defaultIdx =
    typeof s.defaultSchemeIndex === 'number' ? s.defaultSchemeIndex : 0;
  const defaultScheme = isPlainObject(schemes[defaultIdx])
    ? (schemes[defaultIdx] as Record<string, unknown>)
    : isPlainObject(schemes[0])
      ? (schemes[0] as Record<string, unknown>)
      : null;
  const rootColorRules = defaultScheme ? schemeVarsInRoot(defaultScheme) : '';

  return [rootRules, rootColorRules, schemeRules].filter(Boolean).join('\n');
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function toPx(v: unknown, fallback: number): string {
  return `${typeof v === 'number' ? v : fallback}px`;
}

function fontFamily(v: unknown, fallback: string): string {
  if (typeof v !== 'string' || !v) return fallback;
  // Known constructor keys → font stacks.
  const known: Record<string, string> = {
    comfortaa: '"Comfortaa", system-ui, sans-serif',
    manrope: '"Manrope", system-ui, sans-serif',
    inter: '"Inter", system-ui, sans-serif',
    'playfair-display': '"Playfair Display", Georgia, serif',
    roboto: '"Roboto", system-ui, sans-serif',
  };
  return known[v] ?? `"${v}", ${fallback}`;
}

function schemeClassId(id: string): string {
  return id.replace(/^scheme-/, '');
}

function buildThemeSchemeRule(scheme: {
  id: string;
  tokens: Record<string, string>;
}): string {
  const pairs = Object.entries(scheme.tokens).map(([k, v]) => `${k}: ${v}`);
  if (pairs.length === 0) return '';
  return `.color-scheme-${schemeClassId(scheme.id)} { ${pairs.join('; ')}; }`;
}

function themeSchemeToMerchantShape(scheme: {
  id: string;
  name: string;
  tokens: Record<string, string>;
}): Record<string, unknown> {
  const t = scheme.tokens;
  const rgbTripleToHex = (v: string | undefined): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const parts = v.trim().split(/\s+/).map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [r, g, b] = parts;
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  };
  return {
    id: scheme.id,
    name: scheme.name,
    background: rgbTripleToHex(t['--color-bg']),
    surfaceBg: rgbTripleToHex(t['--color-surface']),
    heading: rgbTripleToHex(t['--color-heading']),
    text: rgbTripleToHex(t['--color-text']),
    primaryButton: {
      background: rgbTripleToHex(t['--color-button-bg']),
      text: rgbTripleToHex(t['--color-button-text']),
      border: rgbTripleToHex(t['--color-button-border']),
    },
    secondaryButton: {
      background: rgbTripleToHex(t['--color-button-2-bg']),
      text: rgbTripleToHex(t['--color-button-2-text']),
      border: rgbTripleToHex(t['--color-button-2-border']),
    },
  };
}

function buildSchemeRule(scheme: Record<string, unknown>): string {
  const id = typeof scheme.id === 'string' ? scheme.id : '';
  if (!id) return '';
  const vars = schemeToVars(scheme);
  if (!vars) return '';
  return `.color-scheme-${schemeClassId(id)} {${vars}}`;
}

function schemeVarsInRoot(scheme: Record<string, unknown>): string {
  const vars = schemeToVars(scheme);
  return vars ? `:root {${vars}}` : '';
}

function schemeToVars(scheme: Record<string, unknown>): string {
  const bg = hexToRgbTriple(scheme.background);
  const surface = hexToRgbTriple(scheme.surfaceBg);
  const heading = hexToRgbTriple(scheme.heading);
  const text = hexToRgbTriple(scheme.text);
  const primary = isPlainObject(scheme.primaryButton)
    ? (scheme.primaryButton as Record<string, unknown>)
    : {};
  const secondary = isPlainObject(scheme.secondaryButton)
    ? (scheme.secondaryButton as Record<string, unknown>)
    : {};

  const parts: string[] = [];
  if (bg) parts.push(`--color-bg: ${bg}`);
  if (surface) {
    parts.push(`--color-bg-alt: ${surface}`);
    parts.push(`--color-surface: ${surface}`);
  }
  if (heading) parts.push(`--color-heading: ${heading}`);
  if (text) parts.push(`--color-text: ${text}`);
  const primaryBg = hexToRgbTriple(primary.background);
  const primaryText = hexToRgbTriple(primary.text);
  const primaryBorder = hexToRgbTriple(primary.border);
  if (primaryBg) parts.push(`--color-button-bg: ${primaryBg}`);
  if (primaryText) parts.push(`--color-button-text: ${primaryText}`);
  if (primaryBorder) parts.push(`--color-button-border: ${primaryBorder}`);
  const secondaryBg = hexToRgbTriple(secondary.background);
  const secondaryText = hexToRgbTriple(secondary.text);
  const secondaryBorder = hexToRgbTriple(secondary.border);
  if (secondaryBg) parts.push(`--color-button-secondary-bg: ${secondaryBg}`);
  if (secondaryText) parts.push(`--color-button-secondary-text: ${secondaryText}`);
  if (secondaryBorder) parts.push(`--color-button-secondary-border: ${secondaryBorder}`);

  return parts.length > 0 ? ' ' + parts.join('; ') + ';' : '';
}

function hexToRgbTriple(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const hex = v.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
