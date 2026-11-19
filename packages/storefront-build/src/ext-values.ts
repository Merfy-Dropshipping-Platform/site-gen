import { escapeScriptJson, extFunctionSchema, extIdSchema, extMemberSchema } from '@merfy/storefront-config';
import { z } from 'zod';
import { entityKey } from './entities';
import type { CodeInput, Entity } from './inputs';
import { DATA_NAME } from './section-records';
import type { PlacedSection } from './sections-render';

// Значения сторов расширений в HTML секций (prerender, 20.11). Стор расширения с prerender: true в манифесте сборка
// читает сама — функцией расширения без покупателя — и кладёт значение в снимок данных сущностью ext-value. Шаблон секции
// получает его свойством ext, скрипт — начальным значением стора (тег data-merfy-ext, ядро: часть ext). Значения нет —
// секция рисуется как раньше: данные ей принесёт скрипт.

// Сущность снимка: id — «расширение:функция:запись», данные — { value }. Дата правки у неё постоянная: ключ сборки
// меняет только само значение, а не время чтения.
export const EXT_VALUE_TYPE = 'ext-value';
export const EXT_VALUE_UPDATED_AT = '1970-01-01T00:00:00.000Z';

// Пределы чтения: срок одного вызова, вызовов за сборку, записей в вызове (recordIds расширения), байт одного значения
// (после escapeScriptJson — так оно лежит в теге) и имён ext у одной секции. 4 × 7 КБ — внутри 32 КБ тега входных данных.
export const EXT_VALUE_LIMITS = { callMs: 3000, calls: 10, ids: 100, valueBytes: 7 * 1024, names: 4 } as const;

// ext секции в section.json, разобранный сборщиком: имя свойства шаблона → поле секции с записью, расширение, стор и его
// функция. Только сторы by: record с prerender: true; остальные объявления сборщик во входы не пишет.
const extBindingSchema = z.strictObject({
  field: z.string().min(1),
  ext: extIdSchema,
  store: extMemberSchema,
  fn: extFunctionSchema,
});
export const extBindingsSchema = z
  .record(z.string().regex(DATA_NAME), extBindingSchema)
  .refine((bindings) => Object.keys(bindings).length <= EXT_VALUE_LIMITS.names, {
    error: `не больше ${EXT_VALUE_LIMITS.names} имён ext у секции`,
  });
export type ExtBinding = z.infer<typeof extBindingSchema>;
export type ExtBindings = z.infer<typeof extBindingsSchema>;

export type ExtValue = z.infer<ReturnType<typeof z.json>>;
export type ExtValueLookup = (ext: string, fn: string, recordId: string) => ExtValue | null;

// Id записи — как у параметра секции вида ext-record (storefront-sections, ext-record-field.ts).
const RECORD_ID = /^[\p{L}\p{N}_-]{1,200}$/u;

export const extValueId = (ext: string, fn: string, recordId: string): string => `${ext}:${fn}:${recordId}`;
export const extValueKey = (ext: string, fn: string, recordId: string): string =>
  entityKey(EXT_VALUE_TYPE, extValueId(ext, fn, recordId));

export const extValueEntity = (ext: string, fn: string, recordId: string, value: ExtValue): Entity => ({
  type: EXT_VALUE_TYPE,
  id: extValueId(ext, fn, recordId),
  updatedAt: EXT_VALUE_UPDATED_AT,
  data: { value },
});

// Сколько места значение займёт в теге входных данных секции.
export const extValueBytes = (value: ExtValue): number =>
  Buffer.byteLength(escapeScriptJson(JSON.stringify(value)), 'utf8');

export const NO_EXT_VALUES: ExtValueLookup = () => null;

export function extValueIndexOf(entities: readonly Entity[]): ExtValueLookup {
  const values = new Map(
    entities.filter((entity) => entity.type === EXT_VALUE_TYPE).map((entity) => [entity.id, entity.data.value]),
  );
  return (ext, fn, recordId) => values.get(extValueId(ext, fn, recordId)) ?? null;
}

const recordIdOf = (settings: Readonly<Record<string, unknown>>, field: string): string | null => {
  const value = settings[field];
  return typeof value === 'string' && RECORD_ID.test(value) ? value : null;
};

// Значение, которое сторы секции отдали шаблону и скрипту: по именам ext, начальные значения сторов для ядра и ключи
// сущностей — в зависимости страницы.
export interface ExtSeed {
  ext: string;
  store: string;
  id: string;
  value: ExtValue;
}

export interface SectionExt {
  values: Readonly<Record<string, ExtValue | null>>;
  seeds: readonly ExtSeed[];
  deps: readonly string[];
}

export function sectionExt(
  placed: Pick<PlacedSection, 'ext' | 'settings'>,
  lookup: ExtValueLookup = NO_EXT_VALUES,
): SectionExt {
  const found = Object.entries(placed.ext ?? {}).map(([name, binding]) => {
    const id = recordIdOf(placed.settings, binding.field);
    const value = id === null ? null : lookup(binding.ext, binding.fn, id);
    return { name, binding, id, value };
  });
  const seeds = found.flatMap(({ binding, id, value }): ExtSeed[] =>
    id === null || value === null ? [] : [{ ext: binding.ext, store: binding.store, id, value }],
  );
  return {
    values: Object.fromEntries(found.map(({ name, value }) => [name, value])),
    seeds,
    deps: found.flatMap(({ binding, id, value }) =>
      id === null || value === null ? [] : [extValueKey(binding.ext, binding.fn, id)],
    ),
  };
}

// Зависимости страницы от значений её секций (одна и та же запись у двух секций — один ключ).
export const extDepsOf = (placed: readonly PlacedSection[], lookup: ExtValueLookup | undefined): string[] => [
  ...new Set(placed.flatMap((section) => sectionExt(section, lookup).deps)),
];

// Что сборке читать у расширений: по паре «расширение, функция» — записи, которые выбраны в полях секций.
export interface ExtValueWant {
  ext: string;
  fn: string;
  recordIds: string[];
}

interface WantedRecord {
  ext: string;
  fn: string;
  id: string;
}

const wantedOf = (section: Pick<PlacedSection, 'ext' | 'settings'>): WantedRecord[] =>
  Object.values(section.ext ?? {}).flatMap((binding) => {
    const id = recordIdOf(section.settings, binding.field);
    return id === null ? [] : [{ ext: binding.ext, fn: binding.fn, id }];
  });

function groupedWants(wanted: readonly WantedRecord[]): ExtValueWant[] {
  const groups = new Map<string, ExtValueWant>();
  for (const { ext, fn, id } of wanted) {
    const group = groups.get(`${ext}:${fn}`) ?? { ext, fn, recordIds: [] };
    if (!group.recordIds.includes(id)) group.recordIds.push(id);
    groups.set(`${ext}:${fn}`, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, recordIds: group.recordIds.sort() }))
    .sort((left, right) => (`${left.ext}:${left.fn}` < `${right.ext}:${right.fn}` ? -1 : 1));
}

// Секции, которые стоят на страницах (скрытые не считаем): их выбранные записи.
export const extValueWantsOf = (placed: readonly Pick<PlacedSection, 'ext' | 'settings'>[]): ExtValueWant[] =>
  groupedWants(placed.flatMap(wantedOf));

// То же по коду магазина — для сборщика, который читает значения до сборки.
export function extValueWants(code: Pick<CodeInput, 'sections' | 'pages'>): ExtValueWant[] {
  const bindings = new Map(code.sections.map((section) => [section.name, section.ext]));
  const placed = Object.values(code.pages).flatMap((instances) =>
    instances
      .filter((instance) => instance.hidden !== true)
      .map((instance) => ({ ext: bindings.get(instance.section), settings: instance.settings })),
  );
  return extValueWantsOf(placed);
}

// Тег начальных значений сторов секции (рядом с тегом входных данных): { расширение: { стор: { id записи: значение } } }.
// Ядро (часть ext) читает его до запуска секции. Значений нет — тега нет; не влез в 32 КБ тега входных данных — тоже нет
// (значение уже в шаблоне, скрипт прочтёт его у расширения, как раньше).
export const EXT_TAG_ATTRIBUTE = 'data-merfy-ext';
const EXT_TAG_MAX_BYTES = 32 * 1024;

export function sectionExtTag(seeds: readonly ExtSeed[]): string {
  if (seeds.length === 0) return '';
  const tree: Record<string, Record<string, Record<string, ExtValue>>> = {};
  for (const { ext, store, id, value } of seeds) {
    const stores = (tree[ext] ??= {});
    (stores[store] ??= {})[id] = value;
  }
  const json = escapeScriptJson(JSON.stringify(tree));
  if (Buffer.byteLength(json, 'utf8') > EXT_TAG_MAX_BYTES) return '';
  return `<script type="application/json" ${EXT_TAG_ATTRIBUTE}>${json}</script>`;
}
