import { generateTokensCssV2 } from '../tokens/generateTokensCss.v2';

describe('generateTokensCssV2', () => {
  const baseTheme = {
    id: 'test',
    defaults: {
      '--radius-button': '8px',
      '--font-heading': "'Bitter', serif",
    },
    colorSchemes: [
      {
        id: 'scheme-1',
        name: 'Light',
        tokens: {
          '--color-bg': '255 255 255',
          '--color-heading': '17 17 17',
        },
      },
    ],
    features: { 'flower-catalog': true, 'newsletter': false },
  };

  it('emits :root with theme defaults merged on top of base-defaults', () => {
    const css = generateTokensCssV2(baseTheme as any, {}, {});
    expect(css).toContain(':root {');
    expect(css).toContain('--radius-button: 8px');
    expect(css).toContain("--font-heading: 'Bitter', serif");
    // Base default for untouched token
    expect(css).toContain('--color-error: 220 38 38');
  });

  it('emits .color-scheme-N classes', () => {
    const css = generateTokensCssV2(baseTheme as any, {}, {});
    expect(css).toContain('.color-scheme-1 {');
    expect(css).toContain('--color-bg: 255 255 255');
  });

  it('applies merchant overrides on top of theme defaults', () => {
    const css = generateTokensCssV2(baseTheme as any, { '--radius-button': '16px' }, {});
    expect(css).toMatch(/--radius-button:\s*16px/);
  });

  it('emits feature flags as CSS variables', () => {
    const css = generateTokensCssV2(baseTheme as any, {}, {});
    expect(css).toContain('--feature-flower-catalog: 1');
    expect(css).toContain('--feature-newsletter: 0');
  });

  it('rejects token keys not in TOKEN_REGISTRY', () => {
    const bad = { ...baseTheme, defaults: { '--unknown-token': 'x' } };
    expect(() => generateTokensCssV2(bad as any, {}, {})).toThrow(/--unknown-token/);
  });
});
