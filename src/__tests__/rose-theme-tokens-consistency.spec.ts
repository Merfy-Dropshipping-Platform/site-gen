/**
 * Rose Theme Tokens Consistency Tests
 *
 * Validates that Rose theme template files use CSS custom properties
 * instead of hardcoded hex colors, and that theme.json defaults
 * match the actual tokens.css values.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROSE_DIR = resolve(__dirname, '../../templates/astro/rose');

function readRoseFile(relPath: string): string {
  return readFileSync(resolve(ROSE_DIR, relPath), 'utf-8');
}

// ── 1. theme.json vs tokens.css consistency ──

describe('theme.json / tokens.css consistency', () => {
  let themeJson: any;
  let tokensCss: string;

  beforeAll(() => {
    themeJson = JSON.parse(readRoseFile('theme.json'));
    tokensCss = readRoseFile('src/styles/tokens.css');
  });

  it('color_primary default in theme.json matches tokens.css --color-primary', () => {
    const colorsSetting = themeJson.settings_schema
      .find((s: any) => s.name === 'colors');
    const primarySetting = colorsSetting.settings
      .find((s: any) => s.id === 'color_primary');

    // tokens.css has --color-primary: 0, 0, 0 which is #000000
    // theme.json default should be #000000, NOT #e11d48
    expect(primarySetting.default).toBe('#000000');
  });

  it('radius_button default in theme.json matches tokens.css --radius-button', () => {
    const layoutSetting = themeJson.settings_schema
      .find((s: any) => s.name === 'layout');
    const radiusSetting = layoutSetting.settings
      .find((s: any) => s.id === 'radius_button');

    // tokens.css has --radius-button: 8px
    // theme.json default should be 8px, NOT 9999px
    expect(radiusSetting.default).toBe('8px');
  });
});

// ── 2. tokens.css must define --color-button ──

describe('tokens.css completeness', () => {
  let tokensCss: string;

  beforeAll(() => {
    tokensCss = readRoseFile('src/styles/tokens.css');
  });

  it('defines --color-button in :root', () => {
    // --color-button is used in global.css and Hero.astro but must be defined in tokens.css
    expect(tokensCss).toMatch(/--color-button\s*:/);
  });
});

// ── 3. ProductDetail.tsx must not use undefined --rose-600/--rose-700 vars ──

describe('ProductDetail.tsx CSS variable usage', () => {
  let content: string;

  beforeAll(() => {
    content = readRoseFile('src/components/react/ProductDetail.tsx');
  });

  it('does not reference --rose-600 (undefined CSS variable)', () => {
    expect(content).not.toContain('--rose-600');
  });

  it('does not reference --rose-700 (undefined CSS variable)', () => {
    expect(content).not.toContain('--rose-700');
  });

  it('does not contain hardcoded #e11d48 rose-red hex', () => {
    expect(content).not.toContain('#e11d48');
  });

  it('does not contain hardcoded #be123c dark-rose hex', () => {
    expect(content).not.toContain('#be123c');
  });

  it('uses CSS custom properties for accent colors', () => {
    // Should reference --color-primary or --color-button instead
    expect(content).toMatch(/--color-primary|--color-button/);
  });
});

// ── 4. CheckoutSection.astro must not use hardcoded gray hex values ──

describe('CheckoutSection.astro CSS variable usage', () => {
  let content: string;

  beforeAll(() => {
    content = readRoseFile('src/components/CheckoutSection.astro');
  });

  it('does not use hardcoded #EBF0F5 (should be CSS var)', () => {
    expect(content).not.toContain('#EBF0F5');
  });

  it('does not use hardcoded #8E99A4 (should be CSS var)', () => {
    expect(content).not.toContain('#8E99A4');
  });

  it('does not use hardcoded #5B6B7D (should be CSS var)', () => {
    expect(content).not.toContain('#5B6B7D');
  });

  it('keeps #e53e3e error red (intentional)', () => {
    // Error color is intentional and should NOT be replaced
    expect(content).toContain('#e53e3e');
  });
});

// ── 5. CatalogIsland.tsx and ProductCard.tsx skeleton colors ──

describe('skeleton color consistency', () => {
  it('CatalogIsland.tsx does not use hardcoded #FBFBFB', () => {
    const content = readRoseFile('src/components/react/CatalogIsland.tsx');
    expect(content).not.toContain('#FBFBFB');
  });

  it('ProductCard.tsx does not use hardcoded #FBFBFB', () => {
    const content = readRoseFile('src/components/react/ProductCard.tsx');
    expect(content).not.toContain('#FBFBFB');
  });

  it('CatalogIsland.tsx uses --color-muted for skeleton backgrounds', () => {
    const content = readRoseFile('src/components/react/CatalogIsland.tsx');
    // The skeleton placeholders should reference the muted CSS variable
    expect(content).toMatch(/color-muted/);
  });

  it('ProductCard.tsx uses --color-muted for skeleton backgrounds', () => {
    const content = readRoseFile('src/components/react/ProductCard.tsx');
    expect(content).toMatch(/color-muted/);
  });
});
