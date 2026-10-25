// Поля с записями в настройках секции (блок 8 «Секций и SDK», часть 8г; design.md 8.3, 8.9): виды полей, объявление
// data для скрипта и, с задачи Б8г-3, записи полей при рендере секции. Пакет секций читает отсюда виды и правила data:
// сборка пакет секций не импортирует.
export const RECORD_FIELD_KINDS = ['product', 'collection', 'blog', 'policy'] as const;
export type RecordFieldKind = (typeof RECORD_FIELD_KINDS)[number];

// data секции (Р8г-6): имя — как имя свойства JS; from — запись страницы или поле с записью этой секции; fields —
// публичные поля записи (RECORD_FIELDS, records.ts), до DATA_FIELDS_MAX; имён — до DATA_ENTRIES_MAX.
export const DATA_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/;
export const DATA_FROM = /^(?:page\.record|settings\.[a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const DATA_FIELDS_MAX = 20;
export const DATA_ENTRIES_MAX = 10;

export interface SectionDataEntry {
  from: string;
  fields: string[];
}

// Значения полей с записями по id настройки: публичные поля записи (records.ts) или null.
export type SectionRecordValues = Readonly<Record<string, object | null>>;
