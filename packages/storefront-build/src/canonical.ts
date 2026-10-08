import { createHash } from 'node:crypto';
import { z } from 'zod';

// Канонический JSON и хэш (design.md блока 4, раздел 4): как в инвентаре конформанса theme-contract — ключи объектов
// по алфавиту на любой глубине, порядок массивов сохраняется, поля undefined выбрасываются. Своя копия: пакет не
// зависит от theme-contract, а тест сверяет копию с оригиналом.

const HASH_FORMAT = /^sha256:[0-9a-f]{64}$/;

export const hashSchema = z.string().regex(HASH_FORMAT, 'ожидался хэш sha256:<64 знака hex>');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const keys = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined);
  return Object.fromEntries(keys.map((key) => [key, canonicalize(value[key])]));
}

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

export const sha256 = (data: string | Uint8Array): string =>
  `sha256:${createHash('sha256').update(data).digest('hex')}`;

// Хэш значения — по его каноническому JSON: порядок ключей на хэш не влияет.
export const hashOf = (value: unknown): string => sha256(canonicalJson(value));
