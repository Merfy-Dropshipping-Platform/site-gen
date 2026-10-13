import { z } from 'zod';
import { parseWith } from './parse';

// Ошибки секций из браузеров (план блока 11 «Каркаса витрины», часть 4). Ядро витрины шлёт пачку в шлюз, шлюз кладёт
// её в очередь storefront_section_errors сообщением Nest: { pattern: 'storefront.section-errors', data: { v: 1, shopId,
// receivedAt, errors } }. Здесь — разбор сообщения и строки таблицы storefront_section_error: одна строка на магазин,
// секцию, отпечаток скрипта, стадию, текст и минуту приёма; повтор той же ошибки — счётчик. Минута — по receivedAt
// шлюза: очередь может отстать. Данных покупателя в сообщении нет.
export const SECTION_ERRORS_PATTERN = 'storefront.section-errors';
export const SECTION_ERROR_STAGES = ['load', 'define', 'mount', 'unmount', 'runtime'] as const;
const SECTION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_HEX = /^[0-9a-f]{64}$/;
const SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Отпечаток скрипта в реестре секций (блок 7): sha256:<64 знака hex>.
const HASH_PREFIX = 'sha256:';
const MAX_ERRORS = 10;
const MAX_MESSAGE_LENGTH = 300;
const MINUTE_LENGTH = 'YYYY-MM-DDTHH:MM'.length;

export type SectionErrorStage = (typeof SECTION_ERROR_STAGES)[number];

const entrySchema = z.object({
  section: z.string().regex(SECTION_NAME),
  script: z.string().regex(SCRIPT_HEX),
  stage: z.enum(SECTION_ERROR_STAGES),
  message: z.string().max(MAX_MESSAGE_LENGTH),
});

const messageSchema = z.object({
  pattern: z.literal(SECTION_ERRORS_PATTERN),
  data: z.object({
    v: z.literal(1),
    shopId: z.string().regex(SHOP_ID),
    receivedAt: z.iso.datetime(),
    errors: z.array(entrySchema).min(1).max(MAX_ERRORS),
  }),
});

type Entry = z.infer<typeof entrySchema>;

export interface SectionErrorRow {
  section: string;
  scriptHash: string;
  stage: SectionErrorStage;
  message: string;
  count: number;
}

export interface SectionErrorBatch {
  shopId: string;
  minute: string;
  rows: SectionErrorRow[];
}

// Минута приёма: 2026-10-10T12:34:56.789Z → 2026-10-10T12:34:00.000Z.
export const minuteOf = (receivedAt: string): string => `${receivedAt.slice(0, MINUTE_LENGTH)}:00.000Z`;

const keyOf = (entry: Entry): string => JSON.stringify([entry.section, entry.script, entry.stage, entry.message]);

const emptyRow = (entry: Entry): SectionErrorRow => ({
  section: entry.section,
  scriptHash: `${HASH_PREFIX}${entry.script}`,
  stage: entry.stage,
  message: entry.message,
  count: 0,
});

// Одинаковые записи одной пачки — одна строка со счётчиком.
export function rowsOf(entries: readonly Entry[]): SectionErrorRow[] {
  const rows = new Map<string, SectionErrorRow>();
  for (const entry of entries) {
    const row = rows.get(keyOf(entry)) ?? emptyRow(entry);
    row.count += 1;
    rows.set(keyOf(entry), row);
  }
  return [...rows.values()];
}

// Сообщение не той формы — message-invalid: брокер пишет строку журнала и подтверждает его (повтор не починит).
export function parseSectionErrors(body: unknown): SectionErrorBatch {
  const { data } = parseWith(messageSchema, body, 'message-invalid', 'storefront_section_errors');
  return { shopId: data.shopId, minute: minuteOf(data.receivedAt), rows: rowsOf(data.errors) };
}
