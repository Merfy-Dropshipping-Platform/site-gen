import { RECORD_FIELDS, type RecordFieldKind, type SectionDataEntry } from '@merfy/storefront-build';
import { settingFieldsOf } from './fields';
import { MANIFEST_FILE, type SectionManifest } from './format';
import { isRecordFieldKind } from './record-fields';
import { problem, when, type SectionProblem } from './problems';
import { valuePosition } from './position';

// data секции для скрипта (блок 8 «Секций и SDK», часть 8г; Р8г-6, design.md 8.3): какие поля записи страницы или поля
// с записью этой секции получает тег входных данных. Форма — sectionDataShape (record-fields.ts); здесь — смысл: from —
// поле с записью этой секции, fields — публичные поля вида (RECORD_FIELDS, records.ts), ctx.data.<имя> — только
// объявленное.

// Чтение ctx.<путь> в скрипте — та же форма, что CtxRead фактов скрипта (script-facts.ts, часть 5в):
// ['data', 'product'].
export interface DataRead {
  path: readonly string[];
  file: string;
  line: number;
  column: number;
}

export const DATA_OWNER: Readonly<Record<RecordFieldKind | 'page', string>> = {
  page: 'записи страницы',
  product: 'товара',
  collection: 'коллекции',
  blog: 'блога',
  policy: 'политики',
};

const FROM_KINDS = 'from: page.record или settings.<id поля вида product, collection, blog или policy>';
export const DATA_TEXT = {
  from: (name: string, id: string): string => `data.${name}.from: у секции нет поля с записью «${id}» — ${FROM_KINDS}`,
  field: (name: string, index: number, field: string, owner: string, fields: readonly string[]): string =>
    `data.${name}.fields.${index}: «${field}» — не публичное поле ${owner}. Публичные: ${fields.join(', ')}`,
  unknown: (name: string, known: readonly string[]): string => {
    const tail = known.length === 0 ? ' — data не объявлен' : `. Есть: ${known.join(', ')}`;
    return `ctx.data.${name}: такого имени нет в data section.json${tail}`;
  },
};

const PAGE_FROM = 'page.record';
const SETTINGS_PREFIX = 'settings.';
// У записи страницы публичные поля всех видов: шаблон страницы может быть любым.
const PAGE_FIELDS: readonly string[] = [...new Set(Object.values(RECORD_FIELDS).flat())];

const FIELDS_OF: Readonly<Record<RecordFieldKind | 'page', readonly string[]>> = {
  page: PAGE_FIELDS,
  product: [...RECORD_FIELDS.product],
  collection: [...RECORD_FIELDS.collection],
  blog: [...RECORD_FIELDS.blog],
  policy: [...RECORD_FIELDS.policy],
};

// from — поле с записью этой секции: вид поля с этим id или запись страницы.
function dataOwnerOf(manifest: SectionManifest, from: string): RecordFieldKind | 'page' | undefined {
  if (from === PAGE_FROM) return 'page';
  if (!from.startsWith(SETTINGS_PREFIX)) return undefined;
  const id = from.slice(SETTINGS_PREFIX.length);
  const field = settingFieldsOf(manifest.settings).find((item) => item.id === id);
  const kind = field?.setting.kind;
  return kind !== undefined && isRecordFieldKind(kind) ? kind : undefined;
}

// Проблемы одного имени data: from не у поля с записью или поле не из публичных.
function entryProblems(manifest: SectionManifest, text: string, name: string, entry: SectionDataEntry): SectionProblem[] {
  const owner = dataOwnerOf(manifest, entry.from);
  const atFrom = valuePosition(text, ['data', name, 'from']);
  if (owner === undefined) {
    const id = entry.from.slice(SETTINGS_PREFIX.length);
    return [problem('manifest-invalid', MANIFEST_FILE, DATA_TEXT.from(name, id), atFrom)];
  }
  const fields = FIELDS_OF[owner];
  const privateAt = (index: number): SectionProblem[] => {
    const field = entry.fields[index];
    return when(!fields.includes(field), () =>
      problem(
        'data-field-private',
        MANIFEST_FILE,
        DATA_TEXT.field(name, index, field, DATA_OWNER[owner], fields),
        valuePosition(text, ['data', name, 'fields', index]),
      ),
    );
  };
  return entry.fields.flatMap((_field, index) => privateAt(index));
}

// Смысл data: from 'settings.<id>' — поле этой секции вида product, collection, blog или policy, иначе manifest-invalid
// (DATA_TEXT.from, место — ['data', <имя>, 'from']); поле fields не из RECORD_FIELDS вида — data-field-private
// (DATA_TEXT.field с DATA_OWNER вида, место — ['data', <имя>, 'fields', <номер>]). У from 'page.record' публичные —
// поля всех видов RECORD_FIELDS по порядку, без повторов: шаблон страницы любой. Файл — section.json, место —
// valuePosition(text, путь); порядок — по data, внутри — по fields.
export function dataProblems(manifest: SectionManifest, text: string): SectionProblem[] {
  const entries = Object.entries(manifest.data ?? {});
  return entries.flatMap(([name, entry]) => entryProblems(manifest, text, name, entry));
}

// ctx.data.<имя> без объявления (data-unknown, DATA_TEXT.unknown, известные — ключи data по порядку): только чтения
// с путём ['data', <имя>, …]; файл и место — чтения.
export function dataUnknownProblems(manifest: SectionManifest, reads: readonly DataRead[]): SectionProblem[] {
  const known = Object.keys(manifest.data ?? {});
  const declared: ReadonlySet<string> = new Set(known);
  const problemOf = (read: DataRead): SectionProblem[] => {
    const [scope, name] = read.path;
    if (scope !== 'data' || typeof name !== 'string' || declared.has(name)) return [];
    return [problem('data-unknown', read.file, DATA_TEXT.unknown(name, known), { line: read.line, column: read.column })];
  };
  return reads.flatMap(problemOf);
}

// Ключи кода секции во входах сборки (Б8г-3): recordFields — id поля → вид, у полей видов RECORD_FIELD_KINDS (hint не
// входит); data — как в section.json. Нет — ключа нет.
export function sectionRecordKeys(manifest: SectionManifest): {
  recordFields?: Record<string, RecordFieldKind>;
  data?: Record<string, SectionDataEntry>;
} {
  const recordFields: Record<string, RecordFieldKind> = {};
  for (const field of settingFieldsOf(manifest.settings)) {
    const kind = field.setting.kind;
    if (isRecordFieldKind(kind)) recordFields[field.id] = kind;
  }
  const { data } = manifest;
  return {
    ...(Object.keys(recordFields).length === 0 ? {} : { recordFields }),
    ...(data === undefined ? {} : { data }),
  };
}
