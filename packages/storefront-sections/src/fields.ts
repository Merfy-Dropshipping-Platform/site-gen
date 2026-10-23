import { settingFieldShape, settingProblem } from '@merfy/tokens';
import { z } from 'zod';
import { MENU_ID, MENU_ID_MAX } from './menus';

// Поле настройки секции (блок 1 «Секций и SDK», часть 3, п. 4, Р52): поле настройки панели темы (settingFieldShape из
// @merfy/tokens) или поле вида richtext — HTML с форматированием, только у секций: панель темы его не знает. Значение
// richtext — строка до RICHTEXT_MAX знаков; перед рендером её очищает richtext.ts (в settings.ts).
export const RICHTEXT_MAX = 20_000;

const richtextSpecShape = z.strictObject({ kind: z.literal('richtext'), default: z.string() });
// Вид menu (часть 4, Р1-4-3): значение — id меню из ключа menus ревизии; в шаблон приходит дерево меню (menus.ts).
const menuSpecShape = z.strictObject({ kind: z.literal('menu'), default: z.string() });

// Виды части 5 (design.md 3.14, Р1-5-3). Формы строгие: лишний ключ — отказ. Варианты и вид panel-полей (image, url,
// select, toggle) — из @merfy/tokens как есть; string и text заменены расширенными — с необязательным ai.
export const AI_KINDS = ['title', 'description'] as const;
const IMAGE_URL = /^https?:\/\/\S+$/;
const SCHEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SCHEME_ID_MAX = 40;
export const IMAGE_URL_MAX = 2_048;
export const PADDING_STEP = 4;
export const PADDING_MAX = 200;
const PADDING_MAX_DEFAULT = 120;
const ALIGNMENT_VALUES = ['left', 'center', 'right'] as const;
const optionShape = z.strictObject({ value: z.string(), label: z.string().min(1) });
const imagePairValue = z.strictObject({ url1: z.string(), url2: z.string() });
const paddingValue = z.strictObject({ top: z.int(), bottom: z.int() });

const [imageSpec, urlSpec, , , selectSpec, toggleSpec] = settingFieldShape.shape.setting.options;
const stringSpec = z.strictObject({ kind: z.literal('string'), default: z.string(), ai: z.enum(AI_KINDS).optional() });
const textSpec = z.strictObject({ kind: z.literal('text'), default: z.string(), ai: z.enum(AI_KINDS).optional() });
const imagePairSpec = z.strictObject({
  kind: z.literal('image-pair'),
  default: imagePairValue,
  maxBytes: z.int().positive(),
});
const radioSpec = z.strictObject({
  kind: z.literal('radio'),
  default: z.string(),
  options: z.array(optionShape).min(2),
});
const rangeSpec = z.strictObject({
  kind: z.literal('range'),
  default: z.number(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: z.string().min(1).optional(),
});
const alignmentSpec = z.strictObject({ kind: z.literal('alignment'), default: z.enum(ALIGNMENT_VALUES) });
const colorSchemeSpec = z.strictObject({ kind: z.literal('color-scheme'), default: z.string() });
const paddingSpec = z.strictObject({
  kind: z.literal('padding'),
  default: z.union([z.null(), paddingValue]),
  max: z.int().min(PADDING_STEP).max(PADDING_MAX).optional(),
  step: z
    .int()
    .min(PADDING_STEP)
    .refine((step) => step % PADDING_STEP === 0, { error: 'шаг кратен 4' })
    .optional(),
});

export const sectionFieldShape = settingFieldShape.extend({
  setting: z.discriminatedUnion('kind', [
    imageSpec,
    urlSpec,
    stringSpec,
    textSpec,
    selectSpec,
    toggleSpec,
    richtextSpecShape,
    menuSpecShape,
    imagePairSpec,
    radioSpec,
    rangeSpec,
    alignmentSpec,
    colorSchemeSpec,
    paddingSpec,
  ]),
});

export type SectionField = z.infer<typeof sectionFieldShape>;
export type SectionSettingSpec = SectionField['setting'];

// Значение настройки секции — любое значение JSON (часть 5 блока 1, Р1-5-2): строка, число, да/нет, объект, null.
// В части 5а-2 тип переезжает в storefront-build/src/sections-render.ts, здесь останется реэкспорт.
export type SectionValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: SectionValue }
  | readonly SectionValue[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const ONLY_KEYS = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const onStep = (value: number, min: number, step: number): boolean =>
  Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-9;
const isImageUrl = (value: unknown): boolean =>
  typeof value === 'string' && (value === '' || (value.length <= IMAGE_URL_MAX && IMAGE_URL.test(value)));

// Проверки значений видов части 5 — таблица Р1-5-3. Каждая возвращает текст «<путь>: нужно …» или undefined.
const imagePairText = (path: string, value: unknown): string | undefined =>
  isRecord(value) && ONLY_KEYS(value, ['url1', 'url2']) && isImageUrl(value.url1) && isImageUrl(value.url2)
    ? undefined
    : `${path}: нужны два адреса картинок http(s):// до ${IMAGE_URL_MAX} знаков или пустые строки`;

const oneOfText = (path: string, values: readonly string[], value: unknown): string | undefined =>
  typeof value === 'string' && values.includes(value) ? undefined : `${path}: нужно одно из: ${values.join(', ')}`;

const rangeText = (
  path: string,
  spec: { min: number; max: number; step: number },
  value: unknown,
): string | undefined => {
  const fits =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= spec.min &&
    value <= spec.max &&
    onStep(value, spec.min, spec.step);
  return fits ? undefined : `${path}: нужно число от ${spec.min} до ${spec.max} на шаге ${spec.step} от ${spec.min}`;
};

const schemeText = (path: string, value: unknown): string | undefined => {
  const fits = typeof value === 'string' && (value === '' || (value.length <= SCHEME_ID_MAX && SCHEME_ID.test(value)));
  return fits
    ? undefined
    : `${path}: нужно "" или id схемы: строчные латинские буквы и цифры через дефис, до ${SCHEME_ID_MAX} знаков`;
};

const paddingText = (path: string, max: number, value: unknown): string | undefined => {
  const sideText = (side: unknown): side is number =>
    typeof side === 'number' && Number.isInteger(side) && side >= 0 && side <= max && side % PADDING_STEP === 0;
  const fits =
    value === null ||
    (isRecord(value) && ONLY_KEYS(value, ['top', 'bottom']) && sideText(value.top) && sideText(value.bottom));
  return fits ? undefined : `${path}: нужны два целых числа от 0 до ${max}, кратные ${PADDING_STEP}, или null`;
};

// Проверка значения по виду — таблица Р1-5-3. У видов панели (string, text, url, image, select, toggle) — settingProblem
// из @merfy/tokens: ai и другие ключи спецификации на значение не влияют.
export function sectionSettingProblem(path: string, spec: SectionSettingSpec, value: unknown): string | undefined {
  if (spec.kind === 'menu')
    return typeof value === 'string' && value.length <= MENU_ID_MAX && MENU_ID.test(value)
      ? undefined
      : `${path}: нужен id меню: строчные латинские буквы и цифры через дефис, до ${MENU_ID_MAX} знаков`;
  if (spec.kind === 'richtext')
    return typeof value === 'string' && value.length <= RICHTEXT_MAX
      ? undefined
      : `${path}: нужно HTML до ${RICHTEXT_MAX} знаков`;
  if (spec.kind === 'image-pair') return imagePairText(path, value);
  if (spec.kind === 'radio')
    return oneOfText(
      path,
      spec.options.map((option) => option.value),
      value,
    );
  if (spec.kind === 'range') return rangeText(path, spec, value);
  if (spec.kind === 'alignment') return oneOfText(path, ALIGNMENT_VALUES, value);
  if (spec.kind === 'color-scheme') return schemeText(path, value);
  if (spec.kind === 'padding') return paddingText(path, spec.max ?? PADDING_MAX_DEFAULT, value);
  return settingProblem(path, spec, value);
}
