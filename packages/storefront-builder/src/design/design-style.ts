import type { Align, Band, ButtonLook, CardLook, Font, Px, SiteStyle, TypeRole } from './design-types';
import { isDark, readableOn } from './design-values';

// Сборка «Стиля сайта» из ответов переходников. Переходник отдаёт часть стиля таблицей «путь поля → значение и
// уверенность» (`StylePart`); чего он не снял, того в части нет. Части цепочки DESIGN_STYLE сливаются: у каждого поля
// побеждает самое уверенное значение, при равенстве — инструмент раньше в цепочке. Итог (`finishStyle`) — полный
// SiteStyle контракта: недостающее заполняется нейтрально (текст — чёрный или белый по фону, заголовок — как текст,
// шрифт заголовков — как текста), а его уверенность — 0. Образец — прототип Визи `vizi/design/style.py`.

// Полоса до сборки: цвета, что инструмент нашёл; обязательны фон, доля и верх.
export interface PartBand {
  bg: string;
  fg?: string | null;
  heading?: string | null;
  primary?: string | null;
  primaryFg?: string | null;
  secondary?: string | null;
  secondaryFg?: string | null;
  area: number;
  top: number;
}

export interface PartFont {
  family: string;
  category: Font['category'];
  weight: number | null;
  cyrillic: boolean | null;
  source: Font['source'];
}

export interface StyleValues {
  title: string;
  bands: PartBand[];
  'fonts.heading': PartFont;
  'fonts.body': PartFont;
  typeScale: { role: TypeRole; px: number }[];
  'radius.button': number;
  'radius.card': number;
  'radius.input': number;
  'radius.media': number;
  'border.card': number;
  'button.look': ButtonLook;
  'card.look': CardLook;
  'card.align': Align;
  'spacing.sectionGap': number;
  'spacing.card': number;
  shadows: boolean;
  widthPage: number;
  motion: boolean;
}

export type StylePath = keyof StyleValues;
export type Measured<P extends StylePath> = { value: StyleValues[P]; confidence: number };
export type StylePart = { [P in StylePath]?: Measured<P> };

export const STYLE_PATHS: StylePath[] = [
  'title',
  'bands',
  'fonts.heading',
  'fonts.body',
  'typeScale',
  'radius.button',
  'radius.card',
  'radius.input',
  'radius.media',
  'border.card',
  'button.look',
  'card.look',
  'card.align',
  'spacing.sectionGap',
  'spacing.card',
  'shadows',
  'widthPage',
  'motion',
];

// Поля, без которых конвертеру нечего ставить: пока их нет или они сняты наугад (уверенность ниже SURE — например,
// одна полоса на всю страницу у dembrandt), цепочка идёт дальше.
export const REQUIRED_PATHS: StylePath[] = ['bands', 'fonts.heading', 'fonts.body', 'radius.button', 'button.look'];
export const SURE = 0.5;

// Строка таблицы переходника: как достать значение из сырого ответа и с какой уверенностью.
export type Row<R, P extends StylePath> = {
  take: (raw: R) => StyleValues[P] | null | undefined;
  confidence: number | ((raw: R) => number);
};
export type StyleTable<R> = { [P in StylePath]?: Row<R, P> };

const clamp01 = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;

const present = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

// Чужой ответ бывает любым: поле, что не разобралось, просто не снято.
function safely<T>(take: () => T): T | null {
  try {
    return take();
  } catch {
    return null;
  }
}

function measureRow<R, P extends StylePath>(raw: R, row: Row<R, P>): Measured<P> | null {
  const value = safely(() => row.take(raw));
  if (value === null || value === undefined || !present(value)) return null;
  const rate = row.confidence;
  const confidence = typeof rate === 'number' ? rate : (safely(() => rate(raw)) ?? 0);
  return { value, confidence: clamp01(confidence) };
}

// Поле по обобщённому пути: TypeScript не сводит `StylePart[P]` при записи, поэтому — объектом с вычисленным ключом.
function setPath<P extends StylePath>(part: StylePart, path: P, measured: Measured<P> | null | undefined): void {
  if (measured !== null && measured !== undefined) Object.assign(part, { [path]: measured });
}

function measurePath<R, P extends StylePath>(part: StylePart, raw: R, table: StyleTable<R>, path: P): void {
  const row = table[path];
  if (row !== undefined) setPath(part, path, measureRow(raw, row));
}

export function buildPart<R>(raw: R, table: StyleTable<R>): StylePart {
  const part: StylePart = {};
  for (const path of STYLE_PATHS) measurePath(part, raw, table, path);
  return part;
}

function pickPath<P extends StylePath>(target: StylePart, parts: StylePart[], path: P): void {
  const found = parts.map((part) => part[path]).filter((value) => value !== undefined);
  const best = found.reduce<Measured<P> | undefined>(
    (top, next) => (top === undefined || next.confidence > top.confidence ? next : top),
    undefined,
  );
  setPath(target, path, best);
}

// Слить части по порядку цепочки: у поля — самое уверенное значение, при равенстве — первое.
export function mergeParts(parts: StylePart[]): StylePart {
  const merged: StylePart = {};
  for (const path of STYLE_PATHS) pickPath(merged, parts, path);
  return merged;
}

export const missingPaths = (part: StylePart): StylePath[] =>
  REQUIRED_PATHS.filter((path) => (part[path]?.confidence ?? 0) < SURE);

export const isEmptyPart = (part: StylePart): boolean => STYLE_PATHS.every((path) => part[path] === undefined);

const lower = (hex: string): string => hex.toLowerCase();

export function finishBand(band: PartBand): Band {
  const bg = lower(band.bg);
  const fg = lower(band.fg ?? readableOn(bg));
  const primary = lower(band.primary ?? fg);
  const secondary = band.secondary ? lower(band.secondary) : null;
  return {
    bg,
    fg,
    heading: lower(band.heading ?? fg),
    primary,
    primaryFg: lower(band.primaryFg ?? readableOn(primary)),
    secondary,
    secondaryFg: secondary === null ? null : lower(band.secondaryFg ?? readableOn(secondary)),
    area: clamp01(band.area),
    top: Math.max(0, Math.round(band.top)),
    dark: isDark(bg),
  };
}

const FALLBACK_FONT: PartFont = {
  family: 'system-ui',
  category: 'sans',
  weight: 400,
  cyrillic: null,
  source: 'system',
};

function finishFont(font: PartFont | undefined, fallbackWeight: number): Font {
  const base = font ?? FALLBACK_FONT;
  return { ...base, weight: base.weight ?? fallbackWeight };
}

const pxOf = (
  part: StylePart,
  path:
    | 'radius.button'
    | 'radius.card'
    | 'radius.input'
    | 'radius.media'
    | 'border.card'
    | 'spacing.sectionGap'
    | 'spacing.card'
    | 'widthPage',
): Px => part[path]?.value ?? null;

function confidenceOf(part: StylePart): Record<string, number> {
  const entries = STYLE_PATHS.filter((path) => path !== 'title').map((path): [string, number] => [
    path,
    part[path]?.confidence ?? 0,
  ]);
  return Object.fromEntries(entries);
}

export interface StyleSource {
  url: string;
  finalUrl: string;
  title: string;
}

// Полный SiteStyle из слитой части. Шрифт заголовков, которого нет, — как у текста.
export function finishStyle(part: StylePart, source: StyleSource): SiteStyle {
  const body = finishFont(part['fonts.body']?.value, 400);
  const heading = finishFont(part['fonts.heading']?.value ?? part['fonts.body']?.value, 700);
  const bands = (part.bands?.value ?? [{ bg: '#ffffff', area: 1, top: 0 }]).map(finishBand);
  return {
    v: 1,
    url: source.url,
    finalUrl: source.finalUrl,
    title: (part.title?.value ?? source.title).slice(0, 200),
    bands,
    fonts: { heading, body },
    typeScale: part.typeScale?.value ?? [],
    radius: {
      button: pxOf(part, 'radius.button'),
      card: pxOf(part, 'radius.card'),
      input: pxOf(part, 'radius.input'),
      media: pxOf(part, 'radius.media'),
    },
    border: { card: pxOf(part, 'border.card') },
    button: { look: part['button.look']?.value ?? 'filled' },
    card: { look: part['card.look']?.value ?? 'flat', align: part['card.align']?.value ?? 'left' },
    spacing: { sectionGap: pxOf(part, 'spacing.sectionGap'), card: pxOf(part, 'spacing.card') },
    shadows: part.shadows?.value ?? false,
    widthPage: pxOf(part, 'widthPage'),
    motion: part.motion?.value ?? false,
    confidence: confidenceOf(part),
  };
}
