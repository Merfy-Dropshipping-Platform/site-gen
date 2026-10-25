import {
  DATA_ENTRIES_MAX,
  DATA_FIELDS_MAX,
  DATA_FROM,
  DATA_NAME,
  POLICY_PAGES,
  RECORD_FIELD_KINDS,
  type RecordFieldKind,
} from '@merfy/storefront-build';
import { z } from 'zod';
import type { SectionSettingSpec } from './fields';

// Поля с записями и подсказка (блок 8 «Секций и SDK», часть 8г; design.md 8.9). Значение в ревизии — id или адрес
// записи (у политики — тип), пусто — "" или null; умолчание — null: записей магазина автор секции не знает. В шаблоне
// settings.<id> — публичные поля записи или null (сборка, section-records.ts). Подсказка hint — строка в панели
// конструктора вместо поля, как disabledHint цены у секции Product на проде; значения у неё нет. Виды — только у
// настроек секции: запись получает секция (format.ts, как menu). Значения этот файл импортирует из сборки и zod, у
// модулей пакета — только типы: fields.ts и format.ts импортируют его значения.
export const RECORD_SETTING_KINDS = [...RECORD_FIELD_KINDS, 'hint'] as const;
export type RecordSettingKind = (typeof RECORD_SETTING_KINDS)[number];

const RECORD_REF = /^[\p{L}\p{N}_-]{1,200}$/u;
// Ссылка подсказки — страница кабинета от корня: /products, /settings/payments.
const CABINET_PATH = /^\/[a-z0-9/-]*$/;
const noDefault = z.null().default(null);
const recordSpec = <K extends RecordFieldKind>(kind: K) =>
  z.strictObject({ kind: z.literal(kind), default: noDefault });

export const productSpec = recordSpec('product');
export const collectionSpec = recordSpec('collection');
export const blogSpec = recordSpec('blog');
export const policySpec = recordSpec('policy');
export const hintSpec = z.strictObject({
  kind: z.literal('hint'),
  default: noDefault,
  title: z.string().min(1).max(80),
  text: z.string().min(1).max(200),
  link: z.strictObject({ label: z.string().min(1).max(40), href: z.string().max(200).regex(CABINET_PATH) }).optional(),
});

export type RecordSettingSpec = Extract<SectionSettingSpec, { kind: RecordSettingKind }>;

const SETTING_KINDS: ReadonlySet<string> = new Set(RECORD_SETTING_KINDS);
const FIELD_KINDS: ReadonlySet<string> = new Set(RECORD_FIELD_KINDS);
export const isRecordFieldSpec = (spec: SectionSettingSpec): spec is RecordSettingSpec => SETTING_KINDS.has(spec.kind);
export const isRecordFieldKind = (kind: string): kind is RecordFieldKind => FIELD_KINDS.has(kind);

const POLICY_TYPES: readonly string[] = POLICY_PAGES.map((page) => page.type);
const isEmpty = (value: unknown): boolean => value === null || value === '';
const isRef = (value: unknown): boolean => typeof value === 'string' && RECORD_REF.test(value);
const isPolicyType = (value: unknown): boolean => typeof value === 'string' && POLICY_TYPES.includes(value);
const refText = (owner: string): string =>
  `нужен id или адрес ${owner}: буквы, цифры, «-» и «_», до 200 знаков, или пусто`;

interface ValueRule {
  ok: (value: unknown) => boolean;
  text: string;
}

// Значение по виду: годится ли и текст, если нет.
const VALUE_RULES: Readonly<Record<RecordSettingKind, ValueRule>> = {
  product: { ok: (value) => isEmpty(value) || isRef(value), text: refText('товара') },
  collection: { ok: (value) => isEmpty(value) || isRef(value), text: refText('коллекции') },
  blog: { ok: (value) => isEmpty(value) || isRef(value), text: refText('блога') },
  policy: {
    ok: (value) => isEmpty(value) || isPolicyType(value),
    text: `нужен тип политики: ${POLICY_TYPES.join(', ')} или пусто`,
  },
  hint: { ok: (value) => value === null, text: 'у подсказки значения нет: только null' },
};

export function recordFieldProblem(path: string, spec: RecordSettingSpec, value: unknown): string | undefined {
  const rule = VALUE_RULES[spec.kind];
  return rule.ok(value) ? undefined : `${path}: ${rule.text}`;
}

// data секции для скрипта (Р8г-6, design.md 8.3): имя → { from, fields }. Смысл — section-data.ts: from — поле с
// записью этой секции, fields — публичные поля вида.
const DATA_NAME_TEXT = 'имя — латинские буквы и цифры, первая — строчная: product';
const dataEntryShape = z.strictObject({
  from: z.string().regex(DATA_FROM, { error: 'from — page.record или settings.<id поля с записью>' }),
  fields: z
    .array(z.string().min(1))
    .min(1)
    .max(DATA_FIELDS_MAX)
    .refine((fields) => new Set(fields).size === fields.length, { error: 'поле дважды' }),
});
export const sectionDataShape = z.record(z.string(), dataEntryShape).superRefine((data, context) => {
  const names = Object.keys(data);
  for (const name of names.filter((key) => !DATA_NAME.test(key)))
    context.addIssue({ code: 'custom', path: [name], message: DATA_NAME_TEXT });
  if (names.length > DATA_ENTRIES_MAX)
    context.addIssue({ code: 'custom', message: `не больше ${DATA_ENTRIES_MAX} имён` });
});
