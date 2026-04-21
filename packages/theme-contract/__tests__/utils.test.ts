import { hexToRgb, slugify, capitalize, parseArgs } from '../lib/utils.js';

describe('hexToRgb', () => {
  it('converts a 6-digit hex color to an RGB object', () => {
    expect(hexToRgb('#DB2777')).toEqual({ r: 219, g: 39, b: 119 });
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#e11d48')).toEqual({ r: 225, g: 29, b: 72 });
  });

  it('handles hex without hash prefix', () => {
    expect(hexToRgb('DB2777')).toEqual({ r: 219, g: 39, b: 119 });
    expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('handles 3-digit shorthand hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('abc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('returns null for invalid input', () => {
    expect(hexToRgb('')).toBeNull();
    expect(hexToRgb('not-a-color')).toBeNull();
    expect(hexToRgb('#gggggg')).toBeNull();
    expect(hexToRgb('#12345')).toBeNull();
    expect(hexToRgb('#1234567')).toBeNull();
  });
});

describe('slugify', () => {
  it('converts PascalCase to kebab-case', () => {
    expect(slugify('ProductGrid')).toBe('product-grid');
    expect(slugify('HeroBanner')).toBe('hero-banner');
    expect(slugify('Footer')).toBe('footer');
  });

  it('handles consecutive uppercase letters', () => {
    expect(slugify('HTMLParser')).toBe('html-parser');
    expect(slugify('XMLHttpRequest')).toBe('xml-http-request');
  });

  it('handles already lowercase strings', () => {
    expect(slugify('footer')).toBe('footer');
  });

  it('handles single character', () => {
    expect(slugify('A')).toBe('a');
  });
});

describe('capitalize', () => {
  it('converts slug to Title Case', () => {
    expect(capitalize('product-grid')).toBe('Product Grid');
    expect(capitalize('hero-banner')).toBe('Hero Banner');
  });

  it('handles single word', () => {
    expect(capitalize('footer')).toBe('Footer');
  });

  it('handles multiple hyphens', () => {
    expect(capitalize('xml-http-request')).toBe('Xml Http Request');
  });
});

describe('parseArgs', () => {
  it('parses --key value pairs', () => {
    const result = parseArgs(['--name', 'rose', '--category', 'fashion']);
    expect(result).toEqual({ name: 'rose', category: 'fashion' });
  });

  it('parses boolean flags (--flag)', () => {
    const result = parseArgs(['--island', '--verbose']);
    expect(result).toEqual({ island: true, verbose: true });
  });

  it('parses --no-flag as false', () => {
    const result = parseArgs(['--no-cache', '--no-color']);
    expect(result).toEqual({ cache: false, color: false });
  });

  it('handles mixed args', () => {
    const result = parseArgs(['--name', 'aurora', '--island', '--no-cache', '--port', '4321']);
    expect(result).toEqual({
      name: 'aurora',
      island: true,
      cache: false,
      port: '4321',
    });
  });

  it('handles empty argv', () => {
    expect(parseArgs([])).toEqual({});
  });

  it('treats flag before another flag as boolean true', () => {
    const result = parseArgs(['--verbose', '--name', 'test']);
    expect(result).toEqual({ verbose: true, name: 'test' });
  });
});
