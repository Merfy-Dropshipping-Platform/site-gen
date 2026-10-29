import { settingFieldShape, settingProblem } from '@merfy/tokens';
import { z } from 'zod';
import { MENU_ID, MENU_ID_MAX } from './menus';
import {
  blogSpec,
  collectionSpec,
  hintSpec,
  isRecordFieldSpec,
  policySpec,
  productSpec,
  recordFieldProblem,
} from './record-fields';

// Поле настройки секции (блок 1 «Секций и SDK», часть 3, п. 4, Р52): поле настройки панели темы (settingFieldShape из
// @merfy/tokens) или поле вида richtext — HTML с форматированием, только у секций: панель темы его не знает. Значение
// richtext — строка до RICHTEXT_MAX знаков; перед рендером её очищает richtext.ts (в settings.ts).
export const RICHTEXT_MAX = 20_000;

// inlineEdit (часть 6, Р1-6-1): настройку правят ещё и прямо в превью; допустим у string, text и richtext. Форма панели
// темы (@merfy/tokens) ключа не знает.
const richtextSpecShape = z.strictObject({
  kind: z.literal('richtext'),
  default: z.string(),
  inlineEdit: z.boolean().optional(),
});
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
const stringSpec = z.strictObject({
  kind: z.literal('string'),
  default: z.string(),
  ai: z.enum(AI_KINDS).optional(),
  inlineEdit: z.boolean().optional(),
});
const textSpec = z.strictObject({
  kind: z.literal('text'),
  default: z.string(),
  ai: z.enum(AI_KINDS).optional(),
  inlineEdit: z.boolean().optional(),
});
const imagePairSpec = z.strictObject({
  kind: z.literal('image-pair'),
  default: imagePairValue,
  maxBytes: z.int().positive(),
});
// Видео (базовые секции, E13): адрес файла в хранилище магазина, как у image; панель загружает файл не больше maxBytes.
const videoSpec = z.strictObject({
  kind: z.literal('video'),
  default: z.string(),
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
    videoSpec,
    radioSpec,
    rangeSpec,
    alignmentSpec,
    colorSchemeSpec,
    paddingSpec,
    // Поля с записями и подсказка (блок 8 «Секций и SDK», часть 8г): формы — record-fields.ts.
    productSpec,
    collectionSpec,
    blogSpec,
    policySpec,
    hintSpec,
  ]),
});

export type SectionField = z.infer<typeof sectionFieldShape>;
export type SectionSettingSpec = SectionField['setting'];

// Значение настройки секции — любое значение JSON (часть 5 блока 1, Р1-5-2): строка, число, да/нет, объект, null.
// Тип объявлен в storefront-build (5а-2), здесь — импорт и реэкспорт для потребителей пакета секций.
import type { SectionValue } from '@merfy/storefront-build';

export type { SectionValue };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const ONLY_KEYS = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const onStep = (value: number, min: number, step: number): boolean =>
  Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-9;
const isMediaUrl = (value: unknown): boolean =>
  typeof value === 'string' && (value === '' || (value.length <= IMAGE_URL_MAX && IMAGE_URL.test(value)));

// Проверки значений видов части 5 — таблица Р1-5-3. Каждая возвращает текст «<путь>: нужно …» или undefined.
const imagePairText = (path: string, value: unknown): string | undefined =>
  isRecord(value) && ONLY_KEYS(value, ['url1', 'url2']) && isMediaUrl(value.url1) && isMediaUrl(value.url2)
    ? undefined
    : `${path}: нужны два адреса картинок http(s):// до ${IMAGE_URL_MAX} знаков или пустые строки`;

const videoText = (path: string, value: unknown): string | undefined =>
  isMediaUrl(value) ? undefined : `${path}: нужна пустая строка или адрес видео http(s):// до ${IMAGE_URL_MAX} знаков`;

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

// Проверка значений видов части 5 — таблица Р1-5-3 (часть 8г блока 8: вынесена из sectionSettingProblem). Каждая
// возвращает текст «<путь>: нужно …» или undefined.
const menuText = (path: string, value: unknown): string | undefined =>
  typeof value === 'string' && value.length <= MENU_ID_MAX && MENU_ID.test(value)
    ? undefined
    : `${path}: нужен id меню: строчные латинские буквы и цифры через дефис, до ${MENU_ID_MAX} знаков`;

const richtextText = (path: string, value: unknown): string | undefined =>
  typeof value === 'string' && value.length <= RICHTEXT_MAX
    ? undefined
    : `${path}: нужно HTML до ${RICHTEXT_MAX} знаков`;

type CheckedKind = 'menu' | 'richtext' | 'image-pair' | 'video' | 'radio' | 'range' | 'alignment' | 'color-scheme' | 'padding';
type CheckedSpec = Extract<SectionSettingSpec, { kind: CheckedKind }>;

const KIND_CHECKS: {
  [K in CheckedKind]: (
    path: string,
    spec: Extract<SectionSettingSpec, { kind: K }>,
    value: unknown,
  ) => string | undefined;
} = {
  menu: (path, _spec, value) => menuText(path, value),
  richtext: (path, _spec, value) => richtextText(path, value),
  'image-pair': (path, _spec, value) => imagePairText(path, value),
  video: (path, _spec, value) => videoText(path, value),
  radio: (path, spec, value) =>
    oneOfText(
      path,
      spec.options.map((option) => option.value),
      value,
    ),
  range: (path, spec, value) => rangeText(path, spec, value),
  alignment: (path, _spec, value) => oneOfText(path, ALIGNMENT_VALUES, value),
  'color-scheme': (path, _spec, value) => schemeText(path, value),
  padding: (path, spec, value) => paddingText(path, spec.max ?? PADDING_MAX_DEFAULT, value),
};

function checkOf<K extends CheckedKind>(
  kind: K,
  path: string,
  spec: Extract<SectionSettingSpec, { kind: K }>,
  value: unknown,
): string | undefined {
  return KIND_CHECKS[kind](path, spec, value);
}

const isCheckedSpec = (spec: SectionSettingSpec): spec is CheckedSpec => spec.kind in KIND_CHECKS;

// Проверка значения по виду — таблица Р1-5-3. У видов панели (string, text, url, image, select, toggle) — settingProblem
// из @merfy/tokens: ai и другие ключи спецификации на значение не влияют. Поля с записями и подсказка (часть 8г блока 8)
// — правила record-fields.ts, до проверок видов панели.
export function sectionSettingProblem(path: string, spec: SectionSettingSpec, value: unknown): string | undefined {
  if (isRecordFieldSpec(spec)) return recordFieldProblem(path, spec, value);
  if (isCheckedSpec(spec)) return checkOf(spec.kind, path, spec, value);
  return settingProblem(path, spec, value);
}

// Элемент settings: поле или ссылка на общую настройку (часть 5, Р1-5-5). Ссылка ставит общую настройку на своё место
// в панели; сборка и проверка значений работают только с полями — settingFieldsOf.
export type WrapperRef = { wrapper: 'scheme' | 'padding' | 'sticky' };
export type SettingsEntry = SectionField | WrapperRef;
// Значения-литералы дублируют WRAPPER_IDS типом WrapperId: импорт значения из wrapper.ts создал бы цикл модулей.
const WRAPPER_REF_IDS: readonly ['scheme', 'padding', 'sticky'] = ['scheme', 'padding', 'sticky'];
export const wrapperRefShape = z.strictObject({ wrapper: z.enum(WRAPPER_REF_IDS) });
export const settingsEntryShape = z.union([sectionFieldShape, wrapperRefShape]);

export const isSettingField = (entry: SettingsEntry): entry is SectionField => !('wrapper' in entry);
export const settingFieldsOf = (entries: readonly SettingsEntry[]): SectionField[] => entries.filter(isSettingField);
