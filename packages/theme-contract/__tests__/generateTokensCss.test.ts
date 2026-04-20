import { generateTokensCss, hexToRgb } from '../lib/generateTokensCss.js';
import type { ColorScheme } from '../types.js';

describe('hexToRgb', () => {
  it('converts a 6-digit hex color to RGB triplet string', () => {
    expect(hexToRgb('#DB2777')).toBe('219, 39, 119');
    expect(hexToRgb('#ffffff')).toBe('255, 255, 255');
    expect(hexToRgb('#000000')).toBe('0, 0, 0');
    expect(hexToRgb('#e11d48')).toBe('225, 29, 72');
    expect(hexToRgb('#121212')).toBe('18, 18, 18');
  });

  it('handles hex without hash prefix', () => {
    expect(hexToRgb('DB2777')).toBe('219, 39, 119');
  });

  it('handles 3-digit shorthand hex', () => {
    expect(hexToRgb('#fff')).toBe('255, 255, 255');
    expect(hexToRgb('#000')).toBe('0, 0, 0');
    expect(hexToRgb('#f00')).toBe('255, 0, 0');
  });

  it('returns null for invalid hex', () => {
    expect(hexToRgb('not-a-color')).toBeNull();
    expect(hexToRgb('#gggggg')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});

describe('generateTokensCss', () => {
  const settingsSchema = [
    {
      name: 'Colors',
      settings: [
        { id: 'color_primary', type: 'color' as const, label: 'Primary', default: '#e11d48' },
        { id: 'color_background', type: 'color' as const, label: 'Background', default: '#ffffff' },
        { id: 'color_foreground', type: 'color' as const, label: 'Foreground', default: '#121212' },
      ],
    },
    {
      name: 'Typography',
      settings: [
        { id: 'font_heading', type: 'font' as const, label: 'Heading', default: 'Comfortaa' },
        { id: 'font_body', type: 'font' as const, label: 'Body', default: 'Manrope' },
      ],
    },
    {
      name: 'Layout',
      settings: [
        { id: 'page_width', type: 'range' as const, label: 'Width', default: 1280, unit: 'px' },
        { id: 'radius_base', type: 'range' as const, label: 'Radius', default: 8, unit: 'px' },
      ],
    },
  ];

  it('generates :root CSS with default values from settings_schema', () => {
    const css = generateTokensCss(settingsSchema, {});

    // Color variables should be RGB triplets
    expect(css).toContain('--color-primary:');
    expect(css).toContain('--color-primary-rgb: 225, 29, 72');
    expect(css).toContain('--color-background-rgb: 255, 255, 255');
    expect(css).toContain('--color-foreground-rgb: 18, 18, 18');

    // Font variables
    expect(css).toContain("--font-heading: 'Comfortaa'");
    expect(css).toContain("--font-body: 'Manrope'");

    // Layout variables
    expect(css).toContain('--page-width: 1280px');
    expect(css).toContain('--radius-base: 8px');

    // Wrapped in :root
    expect(css).toContain(':root {');
    expect(css).toContain('}');
  });

  it('applies merchant overrides over defaults', () => {
    const overrides = {
      color_primary: '#DB2777',
      font_heading: 'Inter',
      page_width: 1440,
    };

    const css = generateTokensCss(settingsSchema, overrides);

    expect(css).toContain('--color-primary-rgb: 219, 39, 119');
    expect(css).toContain("--font-heading: 'Inter'");
    expect(css).toContain('--page-width: 1440px');

    // Non-overridden values keep defaults
    expect(css).toContain("--font-body: 'Manrope'");
    expect(css).toContain('--radius-base: 8px');
  });

  it('generates color scheme classes', () => {
    const colorSchemes: ColorScheme[] = [
      {
        name: 'Light',
        background: '#ffffff',
        foreground: '#121212',
        button: '#e11d48',
        buttonText: '#ffffff',
      },
      {
        name: 'Dark',
        background: '#121212',
        foreground: '#ffffff',
        button: '#facc15',
        buttonText: '#000000',
      },
    ];

    const css = generateTokensCss(settingsSchema, {}, colorSchemes);

    expect(css).toContain('.color-scheme-1 {');
    expect(css).toContain('.color-scheme-2 {');
    // Light scheme colors as RGB
    expect(css).toContain('--color-background: 255, 255, 255');
    expect(css).toContain('--color-foreground: 18, 18, 18');
    // Dark scheme colors
    expect(css).toContain('--color-button: 250, 204, 21');
    expect(css).toContain('--color-button-text: 0, 0, 0');
  });

  it('handles empty settings schema', () => {
    const css = generateTokensCss([], {});
    expect(css).toContain(':root {');
    expect(css).toContain('}');
  });

  it('handles missing color scheme fields gracefully', () => {
    const colorSchemes: ColorScheme[] = [
      {
        name: 'Minimal',
        background: '#ffffff',
        foreground: '#000000',
        // No button, no buttonText
      },
    ];

    const css = generateTokensCss(settingsSchema, {}, colorSchemes);

    expect(css).toContain('.color-scheme-1 {');
    expect(css).toContain('--color-background: 255, 255, 255');
    expect(css).toContain('--color-foreground: 0, 0, 0');
  });
});
