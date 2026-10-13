import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { TokenError } from '../src/errors';
import { readFontFile, type FontFacts } from '../src/fonts/font-file';
import { fontsCss } from '../src/fonts/fonts-css';
import { averageWidth, fallbackMetrics, fontEntry, hasRussian, type FontSource } from '../src/fonts/library';
import { parseFontRegistry, type FontRegistry } from '../src/fonts/registry';

// Шрифты новых тем (design.md блока 12): чтение WOFF2, запись реестра из пакета Fontsource, CSS шрифтов магазина.
// Файлы-образцы — Onest 5.3.1 из @fontsource-variable/onest (латиница и кириллица, ось wght).
const brotli = (compressed: Uint8Array): Uint8Array => new Uint8Array(brotliDecompressSync(compressed));
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/fonts/${name}`, import.meta.url)));
const latin = readFontFile(fixture('onest-latin-wght-normal.woff2'), brotli);
const cyrillic = readFontFile(fixture('onest-cyrillic-wght-normal.woff2'), brotli);
const HASH = `sha256:${'a'.repeat(64)}`;

const errorOf = (action: () => unknown): TokenError => {
  try {
    action();
  } catch (error) {
    if (error instanceof TokenError) return error;
    throw error;
  }
  throw new Error('ошибки не было');
};

describe('readFontFile — WOFF2', () => {
  it('размеры шрифта — из таблиц head и hhea', () => {
    expect([latin.unitsPerEm, latin.ascent, latin.descent, latin.lineGap]).toEqual([1000, 970, -305, 0]);
  });

  it('символ есть — номер глифа и его ширина; символа нет — глиф 0', () => {
    expect(latin.advanceOf(latin.glyphOf(0x41))).toBe(670);
    expect(latin.glyphOf(0x416)).toBe(0);
    expect(cyrillic.glyphOf(0x416)).toBeGreaterThan(0);
  });

  it('не WOFF2 — fonts-invalid', () => {
    const error = errorOf(() => readFontFile(new Uint8Array(64), brotli));
    expect(error.code).toBe('fonts-invalid');
    expect(error.problems).toEqual(['файл шрифта: это не WOFF2']);
  });
});

describe('подгонка запасного шрифта и кириллица', () => {
  it('средняя ширина латиницы и подгонка под Arial — как у Capsize и Astro', () => {
    expect(averageWidth(latin)).toBe(469);
    expect(fallbackMetrics(latin, 'Arial')).toEqual({
      base: 'Arial',
      'size-adjust': '105.2039%',
      'ascent-override': '92.2019%',
      'descent-override': '28.9913%',
      'line-gap-override': '0%',
    });
  });

  it('кириллица — по файлам: все буквы А–я, Ё и ё есть хоть в одном', () => {
    const file = (facts: FontFacts) => ({ hash: HASH, bytes: 1, facts });
    expect(hasRussian([file(latin), file(cyrillic)])).toBe(true);
    expect(hasRussian([file(latin)])).toBe(false);
  });
});

// Пакет-образец: два начертания (400 и 700), части latin и cyrillic; факты файлов — от латиницы Onest.
const STATIC_METADATA = {
  id: 'serif-x',
  family: 'Serif X',
  subsets: ['latin', 'cyrillic'],
  weights: [700, 400],
  category: 'serif',
  variable: false,
  license: { type: 'OFL-1.1' },
};

function staticSource(overrides: Partial<FontSource> = {}): FontSource {
  const names = ['latin', 'cyrillic'].flatMap((subset) =>
    ['400', '700'].map((face) => `files/serif-x-${subset}-${face}-normal.woff2`),
  );
  return {
    key: 'serif-x',
    pin: { package: '@fontsource/serif-x', version: '5.3.0' },
    metadata: STATIC_METADATA,
    unicode: { latin: 'U+0000-00FF', cyrillic: 'U+0400-045F' },
    licenseText: 'Copyright 2020 Serif X Authors, with Reserved Font Name "Serif X".',
    files: new Map(
      names.map((name, index) => [name, { hash: `sha256:${String(index).repeat(64)}`, bytes: 100, facts: latin }]),
    ),
    ...overrides,
  };
}

describe('fontEntry — запись реестра из пакета Fontsource', () => {
  it('статичный шрифт: начертания по насыщенностям, части по алфавиту, стек с подогнанным запасным', () => {
    const entry = fontEntry(staticSource());
    expect(entry.axes).toBeNull();
    expect(entry.weights).toEqual([400, 700]);
    expect(entry.stack).toBe('"Serif X", "Serif X Fallback", serif');
    expect(entry.metrics.base).toBe('Times New Roman');
    expect(entry['reserved-name']).toBe(true);
    expect(entry.cyrillic).toBe(false);
    expect(Object.keys(entry.subsets)).toEqual(['cyrillic', 'latin']);
    expect(entry.subsets.latin.files['400']).toEqual({
      path: '_fonts/serif-x-latin-400.0000000000000000.woff2',
      hash: `sha256:${'0'.repeat(64)}`,
      bytes: 100,
      source: 'files/serif-x-latin-400-normal.woff2',
    });
  });

  it('файла нет в пакете — fonts-invalid с именем файла', () => {
    const files = new Map([...staticSource().files].slice(1));
    expect(errorOf(() => fontEntry(staticSource({ files }))).problems).toEqual([
      'fonts.serif-x: в пакете нет файла files/serif-x-latin-400-normal.woff2',
    ]);
  });

  it('переменный пакет без оси wght — fonts-invalid', () => {
    const pin = { package: '@fontsource-variable/serif-x', version: '5.3.0' };
    const metadata = { ...STATIC_METADATA, variable: { wdth: {} } };
    expect(errorOf(() => fontEntry(staticSource({ pin, metadata }))).problems).toEqual([
      'fonts.serif-x: у переменного пакета нет оси wght',
    ]);
  });
});

// Переменный пакет-образец: ось wght, части latin и cyrillic; кириллица — из файла кириллицы Onest.
function variableSource(): FontSource {
  const facts = { latin, cyrillic };
  const names = Object.entries(facts).map(
    ([subset, file], index) =>
      [
        `files/var-x-${subset}-wght-normal.woff2`,
        { hash: `sha256:${String(index + 4).repeat(64)}`, bytes: 200, facts: file },
      ] as const,
  );
  return {
    key: 'var-x',
    pin: { package: '@fontsource-variable/var-x', version: '5.3.0' },
    metadata: {
      ...STATIC_METADATA,
      id: 'var-x',
      family: 'Var X',
      category: 'sans-serif',
      weights: [100, 400, 900],
      variable: { wght: {} },
    },
    unicode: { latin: 'U+0000-00FF', cyrillic: 'U+0400-045F' },
    licenseText: 'Copyright 2020 Var X Authors',
    files: new Map(names),
  };
}

// Реестр-образец: переменный Var X и статичный Serif X.
const SAMPLE: FontRegistry = parseFontRegistry({
  v: 1,
  fonts: { 'serif-x': fontEntry(staticSource()), 'var-x': fontEntry(variableSource()) },
});
const VAR_X = '"Var X", "Var X Fallback", system-ui, sans-serif';
const VAR_LATIN = '_fonts/var-x-latin-wght.4444444444444444.woff2';
const VAR_CYRILLIC = '_fonts/var-x-cyrillic-wght.5555555555555555.woff2';

describe('fontsCss — CSS шрифтов магазина', () => {
  it('переменный шрифт текста и заголовков — одна гарнитура: части с unicode-range, swap, запасной', () => {
    const result = fontsCss(SAMPLE, { body: { stack: VAR_X, weight: 400 }, heading: { stack: VAR_X, weight: 600 } });
    expect(result.css.split('\n')).toEqual([
      `@font-face{font-family:"Var X";font-style:normal;font-display:swap;font-weight:100 900;src:url(/${VAR_CYRILLIC}) format("woff2");unicode-range:U+0400-045F}`,
      `@font-face{font-family:"Var X";font-style:normal;font-display:swap;font-weight:100 900;src:url(/${VAR_LATIN}) format("woff2");unicode-range:U+0000-00FF}`,
      '@font-face{font-family:"Var X Fallback";src:local("Arial");size-adjust:105.2039%;ascent-override:92.2019%;descent-override:28.9913%;line-gap-override:0%}',
    ]);
    expect(result.files.map((file) => file.path)).toEqual([VAR_CYRILLIC, VAR_LATIN]);
  });

  it('предзагрузка — один файл: кириллица шрифта текста', () => {
    const result = fontsCss(SAMPLE, {
      body: { stack: VAR_X, weight: 400 },
      heading: { stack: 'Serif X', weight: 700 },
    });
    expect(result.preload).toBe(`/${VAR_CYRILLIC}`);
  });

  it('статичный шрифт: ближайшая насыщенность, текст и заголовки — разные файлы', () => {
    const result = fontsCss(SAMPLE, {
      body: { stack: '"Serif X", serif', weight: 500 },
      heading: { stack: 'serif x, serif', weight: 800 },
    });
    expect(result.files.map((file) => file.path)).toEqual([
      '_fonts/serif-x-cyrillic-400.2222222222222222.woff2',
      '_fonts/serif-x-latin-400.0000000000000000.woff2',
      '_fonts/serif-x-cyrillic-700.3333333333333333.woff2',
      '_fonts/serif-x-latin-700.1111111111111111.woff2',
    ]);
    expect(result.css).toContain('font-weight:400;src:url(/_fonts/serif-x-latin-400');
    expect(result.css).toContain('src:local("Times New Roman")');
  });

  it('семейства нет в реестре — системный шрифт: ни CSS, ни файлов, ни предзагрузки', () => {
    const system = { stack: 'system-ui, sans-serif', weight: 400 };
    expect(fontsCss(SAMPLE, { body: system, heading: system })).toEqual({ css: '', files: [], preload: null });
  });
});
