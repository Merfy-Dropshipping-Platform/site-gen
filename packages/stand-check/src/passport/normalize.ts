import { parseWith } from '../errors';
import type { Passport, RequestEntry, ScriptEntry } from '../types';
import { passportSchema } from './schema';
import { splitHashedName, unhashText, withoutVersion } from './urls';

// Порядок строк — по кодам символов, без локали: один и тот же паспорт на любой машине.
const compareText = (a: string, b: string): number => Number(a > b) - Number(a < b);

const sortedUnique = (items: readonly string[]): string[] => [...new Set(items)].toSorted(compareText);

function sortedRecord(record: Readonly<Record<string, string>>): Record<string, string> {
  const entries = Object.entries(record).toSorted(([a], [b]) => compareText(a, b));
  return Object.fromEntries(entries);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  const entries = Object.entries(value).toSorted(([a], [b]) => compareText(a, b));
  return Object.fromEntries(entries.map(([key, item]) => [key, sortKeys(item)]));
}

// Значение глобала — JSON; ключи объектов по алфавиту, чтобы порядок записи не давал отличий.
const sortJsonText = (text: string): string => JSON.stringify(sortKeys(JSON.parse(text)));

function normalizeScript(entry: ScriptEntry): ScriptEntry {
  const { name, hash } = splitHashedName(withoutVersion(entry.src));
  const knownHash = hash ?? entry.hash;
  const base = { src: name, kind: entry.kind, bytes: entry.bytes };
  return knownHash === undefined ? base : { ...base, hash: knownHash };
}

function normalizeRequests(entries: readonly RequestEntry[]): RequestEntry[] {
  const cleaned = entries.map((entry) => ({
    url: splitHashedName(withoutVersion(entry.url)).name,
    status: entry.status,
  }));
  const unique = new Map(cleaned.map((entry) => [`${entry.status} ${entry.url}`, entry]));
  return [...unique.values()].toSorted((a, b) => compareText(a.url, b.url) || a.status - b.status);
}

// Сырой паспорт → проверка схемой → нормализация из design.md 5.3. Повторная нормализация ничего не меняет.
export function normalizePassport(raw: unknown): Passport {
  const passport = parseWith(passportSchema, raw, 'passport-invalid', 'паспорт');
  const globals = Object.entries(passport.globals).map(([name, text]): [string, string] => [name, sortJsonText(text)]);
  return {
    version: 1,
    page: passport.page,
    target: passport.target,
    scripts: passport.scripts.map(normalizeScript),
    globals: sortedRecord(Object.fromEntries(globals)),
    storage: sortedUnique(passport.storage),
    cookies: sortedUnique(passport.cookies),
    requests: normalizeRequests(passport.requests),
    errors: sortedUnique(passport.errors.map(unhashText)),
    tokens: sortedRecord(passport.tokens),
    fonts: sortedUnique(passport.fonts.map((font) => font.trim())),
  };
}
