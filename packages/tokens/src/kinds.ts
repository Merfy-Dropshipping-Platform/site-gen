import { z } from 'zod';
import type { FluidValue, ShadowValue, TextValue, TokenDef, TokenKind, TokenValue } from './types';

// Вид решает всё: где живёт значение, с чего начинается имя, что можно в значении, какие классы даёт Tailwind
// (design.md, раздел 3). Значения попадают в CSS и в селекторы, поэтому проверяются строго (раздел 10).

export type KindScope = 'root' | 'scheme';
export const ROOT: KindScope = 'root';
export const SCHEME: KindScope = 'scheme';

// Что нужно знать, чтобы проверить значение. colorNames не задан — цвет тени проверяет словарь своей строкой.
export type ValueContext = {
  values: readonly string[];
  schemeIds: readonly string[];
  colorNames?: readonly string[];
};

export type KindSpec = {
  scope: KindScope;
  prefix: string;
  label: string;
  limits: (context: ValueContext) => string;
  schema: (context: ValueContext) => z.ZodType<TokenValue>;
  classes: (suffix: string, values: readonly string[]) => string[];
};

export const TOKEN_KINDS: readonly TokenKind[] = [
  'color',
  'font',
  'weight',
  'text',
  'tracking',
  'radius',
  'border-width',
  'shadow',
  'spacing',
  'width',
  'choice',
  'scheme',
];

export const HEX_COLOR = /^#[0-9a-f]{6}$/;
const FONT_STACK = /^[A-Za-z0-9 ,'"-]{1,200}$/;

export function orText(values: readonly string[]): string {
  if (values.length < 2) return values.join('');
  return `${values.slice(0, -1).join(', ')} или ${values[values.length - 1]}`;
}

const range = (min: number, max: number) => z.number().min(min).max(max);
const isOrdered = (value: FluidValue): boolean => value.min <= value.max;
const fluidSchema = (max: number) =>
  z
    .object({ min: range(0, max), max: range(0, max) })
    .strict()
    .refine(isOrdered);
const lengthSchema = (max: number): z.ZodType<TokenValue> => z.union([range(0, max), fluidSchema(max)]);
const lengthLimits = (max: number): string => `от 0 до ${max} px или { min, max }, min ≤ max`;
const textSchema = z
  .object({ min: range(8, 160), max: range(8, 160), leading: range(0.8, 3) })
  .strict()
  .refine(isOrdered);

function shadowSchema(context: ValueContext): z.ZodType<TokenValue> {
  const color = context.colorNames === undefined ? z.string() : z.enum(context.colorNames);
  const offset = range(-100, 100);
  return z
    .object({
      x: offset,
      y: offset,
      blur: range(0, 200),
      spread: offset,
      opacity: range(0, 1),
      color: color.optional(),
    })
    .strict();
}

export const KINDS: Record<TokenKind, KindSpec> = {
  color: {
    scope: SCHEME,
    prefix: '',
    label: 'цвет',
    limits: () => '#rrggbb строчными',
    schema: () => z.string().regex(HEX_COLOR),
    classes: (suffix) => [`bg-${suffix}`, `text-${suffix}`, `border-${suffix}`],
  },
  font: {
    scope: ROOT,
    prefix: 'font-',
    label: 'шрифт',
    limits: () => 'стек шрифтов латиницей, как "Manrope, system-ui, sans-serif"',
    schema: () => z.string().regex(FONT_STACK),
    classes: (suffix) => [`font-${suffix}`],
  },
  weight: {
    scope: ROOT,
    prefix: 'weight-',
    label: 'насыщенность',
    limits: () => 'целое от 100 до 900, кратное 100',
    schema: () => z.number().int().min(100).max(900).multipleOf(100),
    classes: (suffix) => [`weight-${suffix}`],
  },
  text: {
    scope: ROOT,
    prefix: 'text-',
    label: 'размер',
    limits: () => '{ min, max, leading }: размеры от 8 до 160 px, min ≤ max, leading от 0,8 до 3',
    schema: () => textSchema,
    classes: (suffix) => [`text-${suffix}`],
  },
  tracking: {
    scope: ROOT,
    prefix: 'tracking-',
    label: 'межбуквенное',
    limits: () => 'от −0,1 до 0,5 em',
    schema: () => range(-0.1, 0.5),
    classes: (suffix) => [`tracking-${suffix}`],
  },
  radius: {
    scope: ROOT,
    prefix: 'radius-',
    label: 'скругление',
    limits: () => lengthLimits(999),
    schema: () => lengthSchema(999),
    classes: (suffix) => [`rounded-${suffix}`],
  },
  'border-width': {
    scope: ROOT,
    prefix: 'border-width-',
    label: 'толщина рамки',
    limits: () => 'целое от 0 до 16 px',
    schema: () => z.number().int().min(0).max(16),
    classes: (suffix) => [`border-width-${suffix}`],
  },
  shadow: {
    scope: ROOT,
    prefix: 'shadow-',
    label: 'тень',
    limits: () =>
      '{ x, y, blur, spread, opacity, color? }: x, y, spread от −100 до 100, blur от 0 до 200, opacity от 0 до 1, ' +
      'color — цвет словаря',
    schema: shadowSchema,
    classes: (suffix) => [`shadow-${suffix}`],
  },
  spacing: {
    scope: ROOT,
    prefix: 'spacing-',
    label: 'отступ',
    limits: () => lengthLimits(400),
    schema: () => lengthSchema(400),
    classes: (suffix) => [`p-${suffix}`, `gap-${suffix}`],
  },
  width: {
    scope: ROOT,
    prefix: 'width-',
    label: 'ширина',
    limits: () => lengthLimits(2560),
    schema: () => lengthSchema(2560),
    classes: (suffix) => [`max-w-${suffix}`, `w-${suffix}`],
  },
  choice: {
    scope: ROOT,
    prefix: 'choice-',
    label: 'выбор',
    limits: (context) => orText(context.values),
    schema: (context) => z.enum(context.values),
    classes: (suffix, values) => values.map((value) => `${suffix}-${value}:`),
  },
  scheme: {
    scope: ROOT,
    prefix: 'scheme-',
    label: 'схема детали',
    limits: (context) => orText(context.schemeIds),
    schema: (context) => z.enum(context.schemeIds),
    classes: (suffix) => [`scheme-${suffix}`],
  },
};

export const suffixOf = (name: string, kind: TokenKind): string => name.slice(KINDS[kind].prefix.length);

export function classesOf(name: string, def: Pick<TokenDef, 'kind' | 'values'>): string[] {
  return KINDS[def.kind].classes(suffixOf(name, def.kind), def.values ?? []);
}

export const isObjectValue = (value: TokenValue | undefined): value is TextValue | FluidValue | ShadowValue =>
  typeof value === 'object';
export const isTextValue = (value: TokenValue | undefined): value is TextValue =>
  isObjectValue(value) && 'leading' in value;
export const isShadowValue = (value: TokenValue | undefined): value is ShadowValue =>
  isObjectValue(value) && 'opacity' in value;
export const isFluidValue = (value: TokenValue | undefined): value is FluidValue =>
  isObjectValue(value) && 'min' in value;

// Строка или число — как есть; объект — JSON. Объект в виде, где ждут число, бывает только в непроверенных данных.
export const scalarText = (value: TokenValue): string =>
  typeof value === 'object' ? JSON.stringify(value) : String(value);

// Значение словами — для карточки токена и ответов инструмента.
const PERCENT = 100;
function pxText(value: TokenValue): string {
  if (!isFluidValue(value)) return `${scalarText(value)} px`;
  if (value.min === value.max) return `${value.min} px`;
  return `${value.min}–${value.max} px`;
}
function textValueText(value: TokenValue): string {
  return isTextValue(value) ? `${pxText(value)}, межстрочный ${value.leading}` : scalarText(value);
}
function shadowText(value: TokenValue): string {
  if (!isShadowValue(value)) return scalarText(value);
  if (value.opacity === 0) return 'без тени';
  const color = value.color === undefined ? '' : `, цвет ${value.color}`;
  return `${value.x} ${value.y} ${value.blur} ${value.spread}, ${Math.round(value.opacity * PERCENT)} %${color}`;
}
const VALUE_TEXT: Partial<Record<TokenKind, (value: TokenValue) => string>> = {
  text: textValueText,
  tracking: (value) => `${scalarText(value)} em`,
  radius: pxText,
  'border-width': pxText,
  shadow: shadowText,
  spacing: pxText,
  width: pxText,
};

export function valueText(kind: TokenKind, value: TokenValue | undefined): string {
  if (value === undefined) return 'не задано';
  const describe = VALUE_TEXT[kind] ?? scalarText;
  return describe(value);
}
