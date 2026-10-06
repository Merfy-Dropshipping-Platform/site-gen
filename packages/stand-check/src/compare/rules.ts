import { z } from 'zod';
import { parseWith } from '../errors';
import type { FieldRule, FieldShape, Op, PassportField } from '../types';

const FIELDS: readonly PassportField[] = [
  'scripts',
  'globals',
  'storage',
  'cookies',
  'requests',
  'errors',
  'tokens',
  'fonts',
];
const OPS: readonly Op[] = ['added', 'removed', 'changed'];
const OP_WORD: Record<Op, string> = { added: 'появилось', removed: 'пропало', changed: 'поменялось' };

// Какие отличия бывают у поля каждого вида: у множества имя и есть значение, поэтому «поменялось» не бывает.
export const OPS_OF_SHAPE: Record<FieldShape, readonly Op[]> = {
  list: ['added', 'removed', 'changed'],
  map: ['added', 'removed', 'changed'],
  set: ['added', 'removed'],
};

// Ключ записи нужен только списку: по нему сравниваются записи двух паспортов.
const KEY_PROBLEM: Record<FieldShape, (rule: FieldRule) => string[]> = {
  list: (rule) => (rule.key === undefined ? [`${rule.field}: у списка нужен key`] : []),
  map: (rule) => (rule.key === undefined ? [] : [`${rule.field}: key бывает только у списка`]),
  set: (rule) => (rule.key === undefined ? [] : [`${rule.field}: key бывает только у списка`]),
};

function ruleProblems(rule: FieldRule): string[] {
  const allowed = OPS_OF_SHAPE[rule.shape];
  const missing = allowed.filter((op) => rule.severity[op] === undefined);
  const extra = OPS.filter((op) => !allowed.includes(op) && rule.severity[op] !== undefined);
  return [
    ...KEY_PROBLEM[rule.shape](rule),
    ...missing.map((op) => `${rule.field}: нет серьёзности для «${OP_WORD[op]}»`),
    ...extra.map((op) => `${rule.field}: у вида ${rule.shape} «${OP_WORD[op]}» не бывает`),
  ];
}

// Таблица целиком: каждое поле паспорта — ровно одно правило, и у каждого правила всё на месте.
export function rulesProblems(rules: readonly FieldRule[]): string[] {
  const countOf = (field: PassportField): number => rules.filter((rule) => rule.field === field).length;
  const missing = FIELDS.filter((field) => countOf(field) === 0).map((field) => `${field}: нет правила`);
  const repeated = FIELDS.filter((field) => countOf(field) > 1).map((field) => `${field}: правило записано дважды`);
  return [...missing, ...repeated, ...rules.flatMap(ruleProblems)];
}

const severitySchema = z.enum(['red', 'amber']).optional();
const reasonSchema = z.string().min(3);

const fieldRuleSchema = z
  .object({
    field: z.enum(['scripts', 'globals', 'storage', 'cookies', 'requests', 'errors', 'tokens', 'fonts']),
    shape: z.enum(['list', 'map', 'set']),
    key: z.enum(['src', 'url']).optional(),
    severity: z.object({ added: severitySchema, removed: severitySchema, changed: severitySchema }).strict(),
    reason: z
      .object({
        all: reasonSchema,
        added: reasonSchema.optional(),
        removed: reasonSchema.optional(),
        changed: reasonSchema.optional(),
      })
      .strict(),
  })
  .strict();

// compare-rules.json: какое отличие красное, какое жёлтое и почему (design.md 5.4). Код только применяет таблицу.
export const rulesFileSchema = z
  .object({ $schema: z.string().optional(), rules: z.array(fieldRuleSchema) })
  .strict()
  .superRefine((file, context) => {
    for (const message of rulesProblems(file.rules)) context.addIssue({ code: 'custom', message, path: ['rules'] });
  });

export function parseRules(raw: unknown): FieldRule[] {
  return parseWith(rulesFileSchema, raw, 'rules-invalid', 'правила сравнения').rules;
}
