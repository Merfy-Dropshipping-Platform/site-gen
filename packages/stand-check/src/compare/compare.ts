import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { StandError } from '../errors';
import type { Difference, FieldRule, FieldShape, Op, Passport, Severity, Verdict } from '../types';

type Entries = ReadonlyMap<string, unknown>;
type Change = { op: Op; name: string; before?: unknown; after?: unknown };

const itemsSchema = z.array(z.record(z.string(), z.unknown()));
const valuesSchema = z.record(z.string(), z.string());
const namesSchema = z.array(z.string());

function keyOf(item: Readonly<Record<string, unknown>>, rule: FieldRule): string {
  const key = item[rule.key ?? ''];
  if (typeof key !== 'string') throw new StandError('rules-invalid', `${rule.field}: у записи нет ключа ${rule.key}`);
  return key;
}

// Как поле читается в сравнении: имя → значение. list — по ключу из правила, map — как есть, set — имя и есть значение.
const ENTRIES: Record<FieldShape, (value: unknown, rule: FieldRule) => Entries> = {
  list: (value, rule) => new Map(itemsSchema.parse(value).map((item) => [keyOf(item, rule), item])),
  map: (value) => new Map(Object.entries(valuesSchema.parse(value))),
  set: (value) => new Map(namesSchema.parse(value).map((name) => [name, name])),
};

function changeOf(name: string, before: unknown, after: unknown): Change[] {
  if (before === undefined) return [{ op: 'added', name, after }];
  if (after === undefined) return [{ op: 'removed', name, before }];
  if (isDeepStrictEqual(before, after)) return [];
  return [{ op: 'changed', name, before, after }];
}

function differenceOf(rule: FieldRule, change: Change): Difference {
  const severity = rule.severity[change.op];
  if (severity === undefined) throw new StandError('rules-invalid', `${rule.field}: нет серьёзности для ${change.op}`);
  return { field: rule.field, ...change, severity, reason: rule.reason[change.op] ?? rule.reason.all };
}

function diffField(rule: FieldRule, a: Passport, b: Passport): Difference[] {
  const before = ENTRIES[rule.shape](a[rule.field], rule);
  const after = ENTRIES[rule.shape](b[rule.field], rule);
  const names = [...new Set([...before.keys(), ...after.keys()])];
  const changes = names.flatMap((name) => changeOf(name, before.get(name), after.get(name)));
  return changes.map((change) => differenceOf(rule, change));
}

// Отличия двух паспортов по таблице правил, в порядке правил и имён (design.md 5.4).
export function comparePassports(a: Passport, b: Passport, rules: FieldRule[]): Difference[] {
  return rules.flatMap((rule) => diffField(rule, a, b));
}

const SEVERITY_RANK: Record<Severity, number> = { amber: 1, red: 2 };
const VERDICT_BY_RANK: readonly Verdict[] = ['clean', 'amber', 'red'];

// Красное отличие — красный вердикт; только жёлтые — жёлтый; отличий нет — чисто.
export function verdictOf(differences: Difference[]): Verdict {
  const ranks = differences.map((difference) => SEVERITY_RANK[difference.severity]);
  return VERDICT_BY_RANK[Math.max(0, ...ranks)];
}
