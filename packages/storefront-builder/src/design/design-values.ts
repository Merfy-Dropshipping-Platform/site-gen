import type { FontCategory, FontSource } from './design-types';

// Мелкие чистые разборы значений CSS для «Стиля сайта»: цвет, пиксели, скругление, семейство и категория шрифта.
// Инструменты и наш скрипт отдают строки вычисленных стилей (`rgb(33, 33, 33)`, `3.35544e+07px`, `"Geograph", system-ui`);
// здесь они становятся значениями формата: цвет — `#rrggbb` строчными (полупрозрачный смешивается с фоном), размер —
// целые пиксели, «пилюля» — `PILL`. Образец — прототип Визи `vizi/design/values.py`.

export const PILL = 9999;
// С такого радиуса скругление — «пилюля»: сайты пишут 999px, 50em, 3.3e7px.
const PILL_FROM = 500;

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const RGB = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/i;
const HEX = /#([0-9a-f]{3,8})\b/i;
const NUMBER = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i;

const channel = (raw: string): number => Math.max(0, Math.min(255, Math.round(Number(raw))));
const alphaOf = (raw: string | undefined): number => {
  if (raw === undefined) return 1;
  return raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
};

function fromRgb(match: RegExpExecArray): Rgba {
  const [, r = '0', g = '0', b = '0', a] = match;
  return { r: channel(r), g: channel(g), b: channel(b), a: alphaOf(a) };
}

function fromHex(match: RegExpExecArray): Rgba | null {
  const digits = (match[1] ?? '').toLowerCase();
  const full = digits.length <= 4 ? [...digits].map((c) => c + c).join('') : digits;
  if (full.length !== 6 && full.length !== 8) return null;
  const part = (from: number): number => parseInt(full.slice(from, from + 2), 16);
  return { r: part(0), g: part(2), b: part(4), a: full.length === 8 ? part(6) / 255 : 1 };
}

// Цвет из строки CSS. Прозрачный, `transparent`, градиент без цвета, `oklch(...)` и непонятное — null.
export function parseColor(raw: unknown): Rgba | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const rgb = RGB.exec(text);
  const hex = rgb === null ? HEX.exec(text) : null;
  const found = rgb === null ? hex && fromHex(hex) : fromRgb(rgb);
  return found === null || found.a <= 0 ? null : found;
}

const two = (value: number): string => Math.round(value).toString(16).padStart(2, '0');
export const hexOf = (color: Pick<Rgba, 'r' | 'g' | 'b'>): string => `#${two(color.r)}${two(color.g)}${two(color.b)}`;

// Полупрозрачный цвет поверх фона → непрозрачный.
export function over(color: Rgba, background: Pick<Rgba, 'r' | 'g' | 'b'>): Rgba {
  const mix = (top: number, bottom: number): number => top * color.a + bottom * (1 - color.a);
  return { r: mix(color.r, background.r), g: mix(color.g, background.g), b: mix(color.b, background.b), a: 1 };
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

// `#rrggbb` строчными; полупрозрачный смешан с фоном (нет фона — с белым). Не цвет — null.
export function hexColor(raw: unknown, background?: string | null): string | null {
  const color = parseColor(raw);
  if (color === null) return null;
  const base = parseColor(background) ?? WHITE;
  return hexOf(color.a >= 1 ? color : over(color, base));
}

// Только непрозрачный: полупрозрачный фон кнопки — не цвет кнопки.
export function opaqueHex(raw: unknown): string | null {
  const color = parseColor(raw);
  return color !== null && color.a >= 1 ? hexOf(color) : null;
}

// Тень видна: в `box-shadow` есть непрозрачный цвет (Tailwind пишет прозрачные тени перед настоящей).
export function visibleShadow(raw: unknown): boolean {
  const text = typeof raw === 'string' ? raw : '';
  return (
    [...text.matchAll(new RegExp(RGB.source, 'gi'))].some((match) => (alphaOf(match[4]) || 0) > 0) ||
    [...text.matchAll(new RegExp(HEX.source, 'gi'))].some((match) => (fromHex(match)?.a ?? 0) > 0)
  );
}

const linear = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

// Относительная яркость WCAG.
export function luminance(hex: string): number {
  const color = parseColor(hex) ?? WHITE;
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

export const isDark = (hex: string): boolean => luminance(hex) < 0.2;

// Читаемый текст на фоне: чёрный или белый, что контрастнее.
export const readableOn = (background: string): string =>
  contrast(background, '#000000') >= contrast(background, '#ffffff') ? '#000000' : '#ffffff';

// Первое число строки CSS: `16px`, `0px 0px 12px 12px` → 16, 0; `normal` → null.
export function px(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const found = typeof raw === 'string' ? NUMBER.exec(raw) : null;
  return found === null ? null : Number(found[0]);
}

export function wholePx(raw: unknown): number | null {
  const value = px(raw);
  return value === null || value < 0 ? null : Math.round(value);
}

// Скругление в целых px; «пилюля» → PILL.
export function radius(raw: unknown): number | null {
  const value = px(raw);
  if (value === null || value < 0) return null;
  return value >= PILL_FROM ? PILL : Math.round(value);
}

const WEIGHT_WORDS: Record<string, number> = { normal: 400, bold: 700, lighter: 300, bolder: 800 };

// Вес шрифта числом, к сотне: `500` → 500, `bold` → 700, `450` → 500.
export function weight(raw: unknown): number | null {
  const text = (typeof raw === 'number' || typeof raw === 'string' ? String(raw) : '').trim().toLowerCase();
  const value = WEIGHT_WORDS[text] ?? px(text);
  if (value === null || value <= 0) return null;
  return Math.min(900, Math.max(100, Math.round(value / 100) * 100));
}

// Общие семейства CSS и известные шрифты → категория. Ключи — в нижнем регистре.
const GENERIC: Record<string, FontCategory> = {
  serif: 'serif',
  'sans-serif': 'sans',
  'system-ui': 'sans',
  '-apple-system': 'sans',
  blinkmacsystemfont: 'sans',
  'ui-sans-serif': 'sans',
  'ui-serif': 'serif',
  monospace: 'mono',
  'ui-monospace': 'mono',
  cursive: 'script',
  fantasy: 'display',
};
const KNOWN: Record<string, FontCategory> = {
  georgia: 'serif',
  'times new roman': 'serif',
  times: 'serif',
  'playfair display': 'serif',
  lora: 'serif',
  'pt serif': 'serif',
  merriweather: 'serif',
  'cormorant garamond': 'serif',
  'courier new': 'mono',
  courier: 'mono',
  menlo: 'mono',
  consolas: 'mono',
};
// Слова в имени, по которым видна категория: «Akkurat Mono», «Self Modern Serif». Порядок важен: «sans» раньше «serif».
const NAME_HINTS: Array<[string, FontCategory]> = [
  ['mono', 'mono'],
  ['sans', 'sans'],
  ['serif', 'serif'],
  ['script', 'script'],
  ['hand', 'script'],
  ['display', 'display'],
];
// Системные семейства: шрифт не грузится, а берётся у ОС.
const SYSTEM = new Set([
  ...Object.keys(GENERIC),
  'arial',
  'helvetica',
  'helvetica neue',
  'segoe ui',
  'georgia',
  'times new roman',
  'times',
  'courier new',
  'courier',
  'menlo',
  'consolas',
  'tahoma',
  'verdana',
]);

const namesOf = (stack: unknown): string[] =>
  (typeof stack === 'string' ? stack : '')
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim(),
    )
    .filter(Boolean);

// Первое семейство из `font-family`: `"Geograph", system-ui` → `Geograph`.
export const familyOf = (stack: unknown): string | null => namesOf(stack)[0] ?? null;

// Категория: по известному имени, по слову в имени, по общему семейству в стеке; не узнали — sans.
export function categoryOf(stack: unknown): FontCategory {
  const names = namesOf(stack).map((name) => name.toLowerCase());
  const first = names[0] ?? '';
  const byHint = NAME_HINTS.find(([word]) => first.includes(word))?.[1];
  const byGeneric = names.map((name) => GENERIC[name]).find((found) => found !== undefined);
  return KNOWN[first] ?? byHint ?? byGeneric ?? 'sans';
}

// Откуда шрифт: системный по имени, Google — по списку загруженных с fonts.googleapis/gstatic, иначе свой.
export function sourceOf(family: string, google: ReadonlySet<string>): FontSource {
  const name = family.toLowerCase();
  if (SYSTEM.has(name)) return 'system';
  return google.has(name) ? 'google' : 'custom';
}
