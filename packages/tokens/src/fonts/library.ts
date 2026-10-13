import { z } from 'zod';
import { RUSSIAN_ERRORS, TokenError, shapeProblems } from '../errors';
import type { FontFacts } from './font-file';
import {
  FONT_CATEGORIES,
  parseFontRegistry,
  type FontCategory,
  type FontEntry,
  type FontFileEntry,
  type FontRegistry,
  type MetricBase,
} from './registry';

// Библиотека шрифтов (design.md блока 12, «решил сам» 4, 6, 9, 12): из пакета Fontsource закреплённой версии —
// запись реестра. Скрипт (scripts/fonts-library.ts) качает файлы и читает их; здесь — только расчёт, без сети и диска.

// Шрифт в библиотеке: какой пакет Fontsource и какой версии. Список — packages/theme-contract/fonts/library.json.
const pinSchema = z.strictObject({
  package: z.string().regex(/^@fontsource(?:-variable)?\/[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});
export const fontLibrarySchema = z.strictObject({ fonts: z.record(z.string(), pinSchema) });
export type FontLibrary = z.infer<typeof fontLibrarySchema>;
export type FontPin = z.infer<typeof pinSchema>;

// metadata.json пакета Fontsource: только поля, которые нужны реестру.
const metadataSchema = z.object({
  id: z.string(),
  family: z.string(),
  subsets: z.array(z.string()).min(1),
  weights: z.array(z.int()).min(1),
  category: z.enum(FONT_CATEGORIES),
  variable: z.union([z.literal(false), z.record(z.string(), z.unknown())]),
  license: z.object({ type: z.string() }),
});
const unicodeSchema = z.record(z.string(), z.string());

export interface SourceFile {
  hash: string;
  bytes: number;
  facts: FontFacts;
}

// Один шрифт, как его скачал скрипт: файлы — по имени в пакете («files/onest-latin-wght-normal.woff2»).
export interface FontSource {
  key: string;
  pin: FontPin;
  metadata: unknown;
  unicode: unknown;
  licenseText: string;
  files: ReadonlyMap<string, SourceFile>;
}

const GENERIC_STACK: Readonly<Record<FontCategory, string>> = {
  'sans-serif': 'system-ui, sans-serif',
  display: 'system-ui, sans-serif',
  serif: 'serif',
  handwriting: 'cursive',
  monospace: 'monospace',
};
const METRIC_BASE_OF: Readonly<Record<FontCategory, MetricBase>> = {
  'sans-serif': 'Arial',
  display: 'Arial',
  serif: 'Times New Roman',
  handwriting: 'Arial',
  monospace: 'Arial',
};
// Размеры системных шрифтов-основ — те же, что у Astro Fonts и Capsize (unitsPerEm и средняя ширина латиницы).
const BASE_METRICS: Readonly<Record<MetricBase, { unitsPerEm: number; xWidthAvg: number }>> = {
  Arial: { unitsPerEm: 2048, xWidthAvg: 913 },
  'Times New Roman': { unitsPerEm: 2048, xWidthAvg: 832 },
};
// Частоты символов английского текста — таблица weightings «latin» из @capsizecss/unpack 4.0.1 (MIT): по ней
// считается средняя ширина буквы, как у Astro и Next.js.
const LATIN_WEIGHTS: Readonly<Record<string, number>> = {
  '0': 0.0053,
  '1': 0.0023,
  '2': 0.0026,
  '3': 0.001,
  '4': 0.0008,
  '5': 0.0015,
  '6': 0.0007,
  '7': 0.0005,
  '8': 0.0007,
  '9': 0.0006,
  ',': 0.0083,
  ' ': 0.154,
  t: 0.0672,
  h: 0.0351,
  e: 0.0922,
  o: 0.0571,
  f: 0.017,
  P: 0.0023,
  p: 0.0163,
  l: 0.0304,
  "'": 0.0014,
  s: 0.0469,
  R: 0.0015,
  u: 0.0207,
  b: 0.0114,
  i: 0.0588,
  c: 0.0232,
  C: 0.0031,
  n: 0.0578,
  a: 0.0668,
  d: 0.0298,
  y: 0.0123,
  w: 0.011,
  B: 0.002,
  r: 0.0526,
  z: 0.0011,
  G: 0.0011,
  j: 0.0009,
  T: 0.0041,
  '.': 0.0079,
  L: 0.0012,
  k: 0.0046,
  m: 0.0181,
  ']': 0.0007,
  J: 0.0009,
  F: 0.0015,
  v: 0.0076,
  g: 0.0155,
  A: 0.004,
  N: 0.0014,
  '-': 0.0018,
  H: 0.0013,
  D: 0.0013,
  M: 0.0025,
  I: 0.0022,
  E: 0.0011,
  '"': 0.0012,
  S: 0.0041,
  '(': 0.001,
  ')': 0.001,
  x: 0.0025,
  W: 0.0012,
  Q: 0.0001,
  Y: 0.0003,
  q: 0.0008,
  V: 0.0005,
  á: 0.0001,
  K: 0.0007,
  U: 0.0016,
  '=': 0.0007,
  '[': 0.0021,
  O: 0.0009,
  é: 0.0001,
  $: 0.0002,
  ':': 0.0008,
  '|': 0.0038,
  '/': 0.0001,
  '%': 0.0001,
  Z: 0.0002,
  ';': 0.0001,
  X: 0.0001,
};
// Кириллица есть, если в файлах шрифта есть все буквы русского алфавита: А–я, Ё и ё.
const RUSSIAN_LETTERS = [0x401, 0x451, ...Array.from({ length: 64 }, (_, index) => 0x410 + index)];
// Строка авторских прав «…, with Reserved Font Name "Lora".» — как её пишет LICENSE пакета Fontsource.
const RESERVED_NAME = /with Reserved Font Names?\s/i;
const VARIABLE_FACE = 'wght';
const REGULAR_WEIGHT = 400;
const MAIN_SUBSET = 'latin';
const FINGERPRINT_LENGTH = 16;

const fail = (key: string, problem: string): never => {
  throw new TokenError('fonts-invalid', [`fonts.${key}: ${problem}`]);
};

function parseOf<T>(schema: z.ZodType<T>, raw: unknown, key: string, what: string): T {
  const result = schema.safeParse(raw, RUSSIAN_ERRORS);
  if (result.success) return result.data;
  throw new TokenError('fonts-invalid', shapeProblems(result.error, `fonts.${key}.${what}`));
}

// Средняя ширина буквы латиницы в единицах шрифта (как avgWidthForSubset у Capsize).
export function averageWidth(facts: FontFacts): number {
  const widths = Object.entries(LATIN_WEIGHTS).map(
    ([character, weight]) => facts.advanceOf(facts.glyphOf(character.codePointAt(0) ?? 0)) * weight,
  );
  return Math.round(widths.reduce((sum, width) => sum + width, 0));
}

const percent = (value: number): string => `${Number.parseFloat((value * 100).toFixed(4))}%`;

// Подогнанный запасной шрифт — формула Capsize (createFontStack) в том виде, как её берёт Astro Fonts.
export function fallbackMetrics(facts: FontFacts, base: MetricBase): FontEntry['metrics'] {
  const baseMetrics = BASE_METRICS[base];
  const sizeAdjust = averageWidth(facts) / facts.unitsPerEm / (baseMetrics.xWidthAvg / baseMetrics.unitsPerEm);
  const adjustedEm = facts.unitsPerEm * sizeAdjust;
  return {
    base,
    'size-adjust': percent(sizeAdjust),
    'ascent-override': percent(facts.ascent / adjustedEm),
    'descent-override': percent(Math.abs(facts.descent) / adjustedEm),
    'line-gap-override': percent(facts.lineGap / adjustedEm),
  };
}

export const hasRussian = (files: readonly SourceFile[]): boolean =>
  RUSSIAN_LETTERS.every((codePoint) => files.some((file) => file.facts.glyphOf(codePoint) !== 0));

type Metadata = z.infer<typeof metadataSchema>;

// Начертания файлов: у переменного пакета — ось wght, у статичного — каждая насыщенность.
function facesOf(source: FontSource, metadata: Metadata): string[] {
  if (!source.pin.package.startsWith('@fontsource-variable/')) return metadata.weights.map(String);
  if (metadata.variable === false || !(VARIABLE_FACE in metadata.variable))
    fail(source.key, 'у переменного пакета нет оси wght');
  return [VARIABLE_FACE];
}

const sourceName = (metadata: Metadata, subset: string, face: string): string =>
  `files/${metadata.id}-${subset}-${face}-normal.woff2`;

function fileEntry(source: FontSource, name: string, subset: string, face: string): FontFileEntry {
  const file = source.files.get(name) ?? fail(source.key, `в пакете нет файла ${name}`);
  const hex = file.hash.slice('sha256:'.length, 'sha256:'.length + FINGERPRINT_LENGTH);
  return {
    path: `_fonts/${source.key}-${subset}-${face}.${hex}.woff2`,
    hash: file.hash,
    bytes: file.bytes,
    source: name,
  };
}

function subsetsOf(source: FontSource, metadata: Metadata, faces: readonly string[]): FontEntry['subsets'] {
  const ranges = parseOf(unicodeSchema, source.unicode, source.key, 'unicode');
  const subsets = [...metadata.subsets].sort().map((subset) => {
    const range = ranges[subset] ?? fail(source.key, `нет unicode-range части ${subset}`);
    const files = faces.map(
      (face) => [face, fileEntry(source, sourceName(metadata, subset, face), subset, face)] as const,
    );
    return [subset, { 'unicode-range': range, files: Object.fromEntries(files) }] as const;
  });
  return Object.fromEntries(subsets);
}

// Файл, по которому считается подгонка: латиница обычного начертания (или ось wght).
function mainFile(source: FontSource, metadata: Metadata, faces: readonly string[]): SourceFile {
  const face = faces.includes(String(REGULAR_WEIGHT)) ? String(REGULAR_WEIGHT) : faces[0];
  const subset = metadata.subsets.includes(MAIN_SUBSET) ? MAIN_SUBSET : metadata.subsets[0];
  const name = sourceName(metadata, subset, face);
  return source.files.get(name) ?? fail(source.key, `в пакете нет файла ${name}`);
}

export function fontEntry(source: FontSource): FontEntry {
  const metadata = parseOf(metadataSchema, source.metadata, source.key, 'metadata');
  const faces = facesOf(source, metadata);
  const base = METRIC_BASE_OF[metadata.category];
  return {
    family: metadata.family,
    category: metadata.category,
    package: source.pin.package,
    version: source.pin.version,
    axes: metadata.variable === false ? null : Object.keys(metadata.variable).sort(),
    weights: [...metadata.weights].sort((left, right) => left - right),
    cyrillic: hasRussian([...source.files.values()]),
    stack: `"${metadata.family}", "${metadata.family} Fallback", ${GENERIC_STACK[metadata.category]}`,
    metrics: fallbackMetrics(mainFile(source, metadata, faces).facts, base),
    license: metadata.license.type,
    'reserved-name': RESERVED_NAME.test(source.licenseText),
    subsets: subsetsOf(source, metadata, faces),
  };
}

export const parseFontLibrary = (raw: unknown): FontLibrary => parseOf(fontLibrarySchema, raw, 'library', 'json');

// Реестр целиком: шрифты по ключу в алфавитном порядке — тот же список даёт тот же файл.
export function fontRegistry(entries: ReadonlyMap<string, FontEntry>): FontRegistry {
  const fonts = [...entries.keys()].sort().map((key) => [key, entries.get(key)] as const);
  return parseFontRegistry({ v: 1, fonts: Object.fromEntries(fonts) });
}
